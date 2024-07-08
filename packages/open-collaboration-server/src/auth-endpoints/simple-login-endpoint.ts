import { inject, injectable } from 'inversify';
import { type Express } from 'express';
import { Emitter } from 'open-collaboration-rpc';
import { AuthEndpoint, AuthSuccessEvent } from './auth-endpoint';
import { Logger, LoggerSymbol } from '../utils/logging';
import { Configuration } from '../utils/configuration';

@injectable()
export class SimpleLoginEndpoint implements AuthEndpoint {

    @inject(LoggerSymbol) protected logger: Logger;

    @inject(Configuration) protected configuration: Configuration;

    private authSuccessEmitter = new Emitter<AuthSuccessEvent>();
    onDidAuthenticate = this.authSuccessEmitter.event;

    shouldActivate(): boolean {
        return this.configuration.getValue('oct-activate-simple-login', 'boolean') ?? false;
    }

    onStart(app: Express, hostname: string, port: number): void {
        app.post('/api/login/simple', async (req, res) => {
            try {
                const token = req.body.token as string;
                const user = req.body.user as string;
                const email = req.body.email as string | undefined;
                await this.authSuccessEmitter.fire({token, userInfo: {name: user, email, authProvider: 'Unverified'}});
                res.send('Ok');
            } catch (err) {
                this.logger.error('Failed to perform simple login', err);
                res.status(400);
                res.send('Failed to perform simple login');
            }
        });
    }
}
