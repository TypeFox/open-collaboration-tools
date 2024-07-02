import { injectable, postConstruct } from "inversify";
import { type Express } from 'express';
import fetch from 'node-fetch';
import { Emitter } from "open-collaboration-rpc";
import { AuthEndpoint, AuthSuccessEvent } from "./auth-endpoint";

export const oauthProviders = Symbol('oauthProviders');

export interface OAuthProvider {
    readonly id: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly authUrl: string;
    readonly tokenEndpoint: string;
    readonly scope: string;
}

@injectable()
export class OAuthEnpoint implements AuthEndpoint {
    private authSuccessEmitter = new Emitter<AuthSuccessEvent>();
    onDidSuccessfullyAuthenticate = this.authSuccessEmitter.event;
    
    protected providers: OAuthProvider[];

    @postConstruct()
    init() {
        this.providers = [{
            id: 'keycloak',
            clientId: 'oct',
            clientSecret: 'VymdPGXqjz6jmEdSWaB2XuIDmt7kGOo5',
            authUrl: 'http://localhost:8080/realms/master/protocol/openid-connect/auth',
            tokenEndpoint: 'http://localhost:8080/realms/master/protocol/openid-connect/token',
            scope: 'profile'
        }]
    }

    shouldActivate(): boolean {
        return this.providers.length > 0;
    }

    onStart(app: Express, hostname: string, port: number): void {
        app.get('/api/login/oauth', async (req, res) => {
            const provider = this.providers.find(p => p.id === req.query.provider)
            const token = req.query.token;
            if (!provider) {
                res.status(400);
                res.send('No proivder found');
                return;
            }

            const url = new URL(provider.authUrl);
            url.searchParams.set('client_id', provider.clientId);
            url.searchParams.set('redirect_uri', this.createRedirectUrl(hostname, port));
            url.searchParams.set('response_type', 'code');
            url.searchParams.set('scope', provider.scope);
            url.searchParams.set('state', `${provider.id}:${token}`);
            
            res.status(302)
            res.location(url.toString());
            res.send();
        });

        app.get('/api/login/oauth-return', async (req, res) => {
            const code = req.query.code;
            const [providerId, token] = (req.query.state as string).split(':');
            const provider = this.providers.find(p => p.id === providerId);
            if(!code || !provider) {
                res.status(400);
                res.send('Error');
                return;
            }

            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('redirect_uri', this.createRedirectUrl(hostname, port));
            params.append('code', code as string);
            params.append('client_id', provider.clientId);
            params.append('client_secret', provider.clientSecret);

            const response = await fetch(provider.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }, 
                body: params
            });
            if((await response.json() as any).access_token) {
                res.status(200);
                res.send();
                this.authSuccessEmitter.fire({token, userInfo: {name: 'test', email: 'test'}});
            } else {
                res.status(500);
                res.send('Error fetching access_token');
            }
        });
    }

    private createRedirectUrl(host: string, port: number): string {
        return `http://localhost:${port}/api/login/oauth-return`
    }
} 