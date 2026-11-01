<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Access required · WebMail by Hookstack</title>
    <link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml">
    <style>
        :root {color-scheme: light dark;font: 16px/1.6 Arial, Helvetica, sans-serif;background:light-dark(#f6f8fc,#15191f);color:light-dark(#1f1f1f,#e3e3e3)}
        * {box-sizing:border-box} body{margin:0;padding:32px 20px} main{max-width:560px;margin:10vh auto;background:light-dark(#fff,#20252d);padding:32px;border-radius:20px}
        .brand{font-weight:600;color:light-dark(#0b57d0,#a8c7fa);margin-bottom:32px}.brand small{font-weight:400;color:light-dark(#545b66,#b7c2d0)}h1{font-size:1.5rem;line-height:1.3}p{overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}a,button{display:inline-flex;align-items:center;min-height:48px;padding:10px 16px;border:1px solid light-dark(#d8dee8,#576170);border-radius:24px;font:inherit;color:inherit;text-decoration:none;background:transparent;cursor:pointer}form{margin:0}a:first-child{background:light-dark(#d3e3fd,#344766)}:focus-visible{outline:3px solid light-dark(#0b57d0,#a8c7fa);outline-offset:3px}
    </style>
    <style>
        .brand{display:flex;align-items:center;gap:12px;font-size:23px;font-weight:700;line-height:1.1;color:inherit}
        .brand-mark{width:52px;height:32px;flex-shrink:0;background:light-dark(#0b57d0,#a8c7fa);mask:url('/brand/webmail-mark.png') center/contain no-repeat}
        .brand small{display:block;font-size:12px;line-height:1.4;margin-top:3px}
    </style>
</head>
<body><main>
    <div class="brand" role="img" aria-label="WebMail by Hookstack"><span class="brand-mark" aria-hidden="true"></span><span aria-hidden="true">WebMail <small>by Hookstack</small></span></div>
    <h1>Additional access is required</h1>
    <p>{{ $exception->getMessage() ?: 'Your account does not have permission to open this page.' }}</p>
    @auth
        <p>For administration, enable two-factor authentication in Security, then sign in with your password and authenticator code. Mailbox access must be assigned by your administrator.</p>
        <div class="actions">
            <a href="/settings/security">Review security</a>
            <a href="/mail">Back to mail</a>
            <form method="post" action="/logout">@csrf<button type="submit">Sign out</button></form>
        </div>
    @else
        <div class="actions"><a href="/login">Sign in</a></div>
    @endauth
</main></body>
</html>
