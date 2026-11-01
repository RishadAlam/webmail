<?php

namespace App\Console\Commands;

use App\Services\OwnerBootstrap;
use Illuminate\Console\Command;
use Illuminate\Validation\ValidationException;

class BootstrapOwner extends Command
{
    protected $signature = 'webmail:bootstrap-owner';

    protected $description = 'Create the first owner once, using a hidden interactive password prompt';

    public function handle(OwnerBootstrap $bootstrap): int
    {
        try {
            $bootstrap->assertAvailable();
            if (! $this->input->isInteractive()) {
                $this->error('Owner bootstrap requires an interactive terminal with hidden password input.');

                return self::FAILURE;
            }
            $name = (string) $this->ask('Owner name');
            $email = (string) $this->ask('Owner email');
            $password = (string) $this->secret('Password (16+ characters; mixed case, number and symbol)', false);
            $confirmation = (string) $this->secret('Confirm password', false);
            $bootstrap->create($name, $email, $password, $confirmation);
            unset($password, $confirmation);
        } catch (ValidationException $exception) {
            foreach ($exception->validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        } catch (\DomainException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        } catch (\RuntimeException) {
            $this->error('Owner bootstrap failed. Check database availability and reviewed migrations.');

            return self::FAILURE;
        }
        $this->info('Owner created. Sign in, open /settings/security, enroll an authenticator and save recovery codes securely.');
        $this->info('Then sign out and sign in with MFA before accessing Administration. No mailbox or provider account was provisioned.');

        return self::SUCCESS;
    }
}
