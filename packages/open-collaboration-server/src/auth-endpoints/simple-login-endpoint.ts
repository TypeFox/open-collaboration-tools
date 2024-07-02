import { injectable } from "inversify";
import { type Express } from 'express';
import { Emitter } from "open-collaboration-rpc";
import { AuthEndpoint, AuthSuccessEvent } from "./auth-endpoint";

@injectable()
export class SimpleLoginEndpoint implements AuthEndpoint {
    private authSuccessEmitter = new Emitter<AuthSuccessEvent>();
    onDidSuccessfullyAuthenticate = this.authSuccessEmitter.event;

    shouldActivate(): boolean {
        return process.env.OCT_DEACTIVATE_SIMPLE_LOGIN !== 'true';
    }

    onStart(app: Express, hostname: string, port: number): void {
        app.post('/api/login/simple', async (req, res) => {
            try {
                const token = req.body.token as string;
                const user = req.body.user as string;
                const email = req.body.email as string | undefined;
                await this.authSuccessEmitter.fire({token, userInfo: {name: user, email}});
                res.send('Ok');
            } catch (err) {
                console.error(err);
                res.status(400);
                res.send('Failed to perform simple login');
            }
        });
    }
}