#!/usr/bin/env python3
"""Isolated local Apache smoke check. Never targets the pilot database or live providers."""
import base64
import ipaddress
import json
import os
import pathlib
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

IMAGE = "webmail-production-review:local"
DATABASE = "webmail_runtime_review"
CONTAINER = "webmail-runtime-review"
POSTGRES = "webmail-runtime-postgres"
NETWORK = "webmail-runtime-review"
POSTGRES_IMAGE = "postgres:17@sha256:3b0cda93be7c8dba2ed484d19393d93845dc3dafb88973e248ba8e6d99d784e1"
http_origin = None


def command(*args, timeout=60, check=True):
    return subprocess.run(args, check=check, text=True, capture_output=True, timeout=timeout)


def request(path, host="mail.example.test", extra=None):
    req = urllib.request.Request(http_origin + path, headers={"Host": host, **(extra or {})})
    try:
        response = urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.headers, response.read().decode("utf-8", errors="replace")


created_network = False
created_postgres = False
created_container = False
with tempfile.TemporaryDirectory(prefix="webmail-runtime-review-") as directory:
    directory = pathlib.Path(directory)
    tls = directory / "tls"
    tls.mkdir(mode=0o700)
    command("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            "-subj", "/CN=WebMail disposable runtime CA", "-keyout", str(tls / "root.key"),
            "-out", str(tls / "root.crt"), "-addext", "basicConstraints=critical,CA:TRUE",
            "-addext", "keyUsage=critical,keyCertSign,cRLSign")
    command("openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=" + POSTGRES,
            "-keyout", str(tls / "server.key"), "-out", str(tls / "server.csr"))
    (tls / "server.ext").write_text("subjectAltName=DNS:" + POSTGRES + "\nextendedKeyUsage=serverAuth\n")
    command("openssl", "x509", "-req", "-days", "1", "-in", str(tls / "server.csr"),
            "-CA", str(tls / "root.crt"), "-CAkey", str(tls / "root.key"), "-CAcreateserial",
            "-extfile", str(tls / "server.ext"), "-out", str(tls / "server.crt"))
    (tls / "root.key").chmod(0o600)
    (tls / "server.key").chmod(0o600)
    database_password = base64.urlsafe_b64encode(os.urandom(24)).decode()
    pg_env = directory / "postgres.env"
    pg_env.write_text("POSTGRES_DB=" + DATABASE + "\nPOSTGRES_USER=webmail\nPOSTGRES_PASSWORD=" + database_password + "\n")
    pg_env.chmod(0o600)
    envfile = directory / "runtime.env"
    envfile.write_text("\n".join([
        "APP_ENV=production", "APP_DEBUG=false", "APP_URL=https://mail.example.test",
        "APP_KEY=base64:" + base64.b64encode(os.urandom(32)).decode(),
        "MAIL_DOMAIN=fictional-mail.org", "DB_CONNECTION=pgsql", "DB_HOST=" + POSTGRES, "DB_PORT=5432", "DB_DATABASE=" + DATABASE,
        "DB_USERNAME=webmail", "DB_PASSWORD=" + database_password, "DB_URL=", "DB_SSLMODE=verify-full",
        "PGSSLROOTCERT=/fixture-ca/root.crt",
        "SESSION_DRIVER=database", "SESSION_ENCRYPT=true", "SESSION_SECURE_COOKIE=true",
        "SESSION_HTTP_ONLY=true", "SESSION_SAME_SITE=lax", "CACHE_STORE=database",
        "QUEUE_CONNECTION=database", "WEBMAIL_PROVIDER=mock", "EXTERNAL_SENDING_ENABLED=false",
        "LOG_CHANNEL=stderr", "LOG_LEVEL=warning",
    ]) + "\n")
    envfile.chmod(0o600)
    common = ["--network", NETWORK, "--env-file", str(envfile),
              "--mount", "type=bind,src=" + str(tls / "root.crt") + ",dst=/fixture-ca/root.crt,readonly"]
    try:
        command("docker", "network", "create", "--internal", NETWORK)
        created_network = True
        pg_start = "cp /fixture-tls/server.crt /tmp/server.crt && cp /fixture-tls/server.key /tmp/server.key && chown postgres:postgres /tmp/server.crt /tmp/server.key && chmod 600 /tmp/server.key && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key"
        command("docker", "run", "--detach", "--name", POSTGRES, "--network", NETWORK,
                "--network-alias", "wrong-runtime-host", "--env-file", str(pg_env),
                "--mount", "type=bind,src=" + str(tls) + ",dst=/fixture-tls,readonly",
                "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=256m", "--memory", "256m",
                "--entrypoint", "sh", POSTGRES_IMAGE, "-c", pg_start)
        created_postgres = True
        pg_deadline = time.monotonic() + 30
        while command("docker", "exec", POSTGRES, "pg_isready", "-U", "webmail", "-d", DATABASE, check=False).returncode:
            if time.monotonic() >= pg_deadline:
                raise RuntimeError("Disposable TLS PostgreSQL did not become ready.")
            time.sleep(0.25)
        command("docker", "run", "--rm", *common, "--entrypoint", "php", IMAGE,
                "artisan", "migrate", "--force", "--no-interaction", timeout=120)
        tls_probe = 'require "vendor/autoload.php"; $app = require "bootstrap/app.php"; $app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); echo json_encode(Illuminate\\Support\\Facades\\DB::selectOne("select ssl from pg_stat_ssl where pid = pg_backend_pid()"));'
        tls_result = json.loads(command("docker", "run", "--rm", *common, "--entrypoint", "php", IMAGE, "-r", tls_probe).stdout)
        assert tls_result["ssl"] is True, tls_result
        for setting, expected in (("DB_HOST=wrong-runtime-host", "does not match host name"),
                                  ("PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt", "certificate verify failed")):
            rejected = command("docker", "run", "--rm", *common, "-e", setting, "--entrypoint", "php", IMAGE, "-r", tls_probe, check=False)
            assert rejected.returncode != 0 and expected in rejected.stdout + rejected.stderr
        command("docker", "run", "--detach", "--name", CONTAINER, *common,
                "--memory", "512m", "--cpus", "0.1", IMAGE)
        created_container = True
        networks = json.loads(command("docker", "inspect", "--format", "{{json .NetworkSettings.Networks}}", CONTAINER).stdout)
        address = networks[NETWORK]["IPAddress"]
        assert ipaddress.ip_address(address).is_private
        # Internal bridges omit published host ports. Probe its private address directly, with no proxy.
        http_origin = "http://" + address + ":8080"
        deadline = time.monotonic() + 60
        while True:
            try:
                if request("/up")[0] == 200:
                    break
            except (OSError, urllib.error.URLError):
                pass
            if time.monotonic() >= deadline:
                logs = command("docker", "logs", CONTAINER)
                state = command("docker", "inspect", "--format", "{{json .State}}", CONTAINER).stdout
                ports = command("docker", "port", CONTAINER).stdout
                raise RuntimeError("Apache did not become healthy: " + logs.stdout + logs.stderr + state + ports)
            time.sleep(0.25)
        status, headers, body = request("/login")
        assert status == 200, status
        assert "no-store" in headers.get("Cache-Control", "")
        assert "script-src 'self' 'nonce-" in headers.get("Content-Security-Policy", "")
        cookies = headers.get_all("Set-Cookie") or []
        assert any("secure" in cookie.lower() and "httponly" in cookie.lower() for cookie in cookies)
        assert request("/.env")[0] in (403, 404)
        assert request("/composer.json")[0] in (403, 404)
        assert request("/login", "attacker.example")[0] == 400
        status, _, body = request("/login", extra={"X-Forwarded-Host": "attacker.example", "X-Forwarded-Proto": "http"})
        assert status == 200 and "attacker.example" not in body
        php_check = 'require "vendor/autoload.php"; echo json_encode(["uid"=>posix_geteuid(),"phpunit"=>Composer\\InstalledVersions::isInstalled("phpunit/phpunit"),"app_writable"=>is_writable("app"),"public_writable"=>is_writable("public"),"node"=>file_exists("/usr/local/bin/node"),"composer"=>file_exists("/usr/local/bin/composer")]);'
        runtime = json.loads(command("docker", "exec", CONTAINER, "php", "-r", php_check).stdout)
        assert runtime == {"uid": 33, "phpunit": False, "app_writable": False, "public_writable": False, "node": False, "composer": False}, runtime
        for setting in ("APP_DEBUG=true", "DB_CONNECTION=mysql", "DB_SSLMODE=disable", "MAIL_DOMAIN=webmail.test"):
            rejected = command("docker", "run", "--rm", *common, "-e", setting, IMAGE, check=False)
            assert rejected.returncode != 0 and "Unsafe production configuration" in rejected.stdout + rejected.stderr
        command("docker", "stop", "--time", "30", CONTAINER, timeout=40)
        state = json.loads(command("docker", "inspect", "--format", "{{json .State}}", CONTAINER).stdout)
        assert state["ExitCode"] == 0 and not state["OOMKilled"], state
        print(json.dumps({"result": "passed", "database": DATABASE, "health": 200, "login": 200,
                          "private_files": "blocked", "unexpected_host": 400,
                          "forwarded_host": "ignored", "private_headers": "passed",
                          "unsafe_debug_mysql_tls_and_domain": "rejected", "runtime": runtime,
                          "postgres_tls": "verify-full with disposable CA", "wrong_hostname_and_ca": "rejected",
                          "cpu_limit": 0.1, "memory_limit_mib": 512,
                          "graceful_exit": state["ExitCode"], "oom_killed": state["OOMKilled"]}, indent=2))
    finally:
        if created_container:
            command("docker", "rm", "--force", CONTAINER)
        if created_postgres:
            command("docker", "rm", "--force", POSTGRES)
        if created_network:
            command("docker", "network", "rm", NETWORK)
