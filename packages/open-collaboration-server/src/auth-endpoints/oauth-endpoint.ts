import { injectable, postConstruct } from "inversify";
import { type Express } from 'express';
import { Emitter } from "open-collaboration-rpc";
import { AuthEndpoint, AuthSuccessEvent } from "./auth-endpoint";
import passport from 'passport';
// import OAuth2Strategy = require("passport-oauth2")
import { Strategy as GithubStrategy } from "passport-github";

export const oauthProviders = Symbol('oauthProviders');

export interface OAuthProvider {
    id: string;
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenEndpoint: string;
    scope: string;
}

const OAUTH_CONFIG_PREFIX = 'oct_oauth_';
const REDIRECT_URI_PATH = '/api/login/oauth-callback';

@injectable()
export class OAuthEnpoint implements AuthEndpoint {
    private authSuccessEmitter = new Emitter<AuthSuccessEvent>();
    onDidSuccessfullyAuthenticate = this.authSuccessEmitter.event;
    
    protected providers: OAuthProvider[];

    @postConstruct()
    init() {
        // TODO remove when creating PR
        this.providers = [{
            id: 'keycloak',
            clientId: 'oct',
            clientSecret: 'VymdPGXqjz6jmEdSWaB2XuIDmt7kGOo5',
            authUrl: 'http://localhost:8080/realms/master/protocol/openid-connect/auth',
            tokenEndpoint: 'http://localhost:8080/realms/master/protocol/openid-connect/token',
            scope: 'profile'
        }]

        const newProviders: Partial<OAuthProvider>[] = [];
        for (const key in process.env) {
            if (key.toLowerCase().startsWith(OAUTH_CONFIG_PREFIX)) {
                const parts = key.split('_');
                if (parts.length === 4) {
                    const providerId = parts[2].toLowerCase();
                    let provider = newProviders.find(p => p.id === providerId);
                    if(!provider) {
                        newProviders.push({id: providerId})
                        provider = newProviders[newProviders.length - 1];
                    }
                    switch(parts[3].toLowerCase()) {
                        case 'clientid':
                            provider.clientId = process.env[key] as string;
                            break;
                        case 'clientsecret':
                            provider.clientSecret = process.env[key] as string;
                            break;
                        case 'authurl':
                            provider.authUrl = process.env[key] as string;
                            break;
                        case 'tokenendpoint':
                            provider.tokenEndpoint = process.env[key] as string;
                            break;
                        case 'scope':
                            provider.scope = process.env[key] as string;
                            break;
                    }
                    
                }
            }
        }
        this.providers.push(...newProviders as OAuthProvider[]);

    }

    shouldActivate(): boolean {
        return this.providers.length > 0;
    }

    onStart(app: Express, hostname: string, port: number): void {

        this.providers.forEach(p => {
            passport.use(p.id, new GithubStrategy({
                authorizationURL: p.authUrl,
                tokenURL: p.tokenEndpoint,
                clientID: p.clientId,
                clientSecret: p.clientSecret,
                callbackURL: this.createRedirectUrl(hostname, port),
                
            }, (accessToken: string, refreshToken: string, profile) => {
                this.authSuccessEmitter.fire({token: accessToken, userInfo: {name: 'test', email: 'test', authProvider: p.id}});
            }))
        
        })


        app.get('/api/login/oauth', async (req, res) => {
            const provider = this.providers.find(p => p.id === req.query.provider)
            const token = req.query.token;
            if (!provider) {
                res.status(400);
                res.send('No proivder found');
                return;
            }
            passport.authenticate(provider.id, { failureRedirect: '/login', state: `${provider.id}:${token}`, scope: provider.scope })(req, res, () =>{});
        });

        app.get(REDIRECT_URI_PATH, async (req, res) => {
            const [providerId, token] = (req.query.state as string).split(':');
            const provider = this.providers.find(p => p.id === providerId);
            if(!provider) {
                res.status(400);
                res.send('Error');
                return;
            }
            passport.authenticate(provider.id, { failureRedirect: '/login', state: `${provider.id}:${token}`, scope: provider.scope })(req, res, () =>{
                console.log('next')
            });
        });
    }

    private createRedirectUrl(host: string, port: number): string {
        return `http://localhost:${port}${REDIRECT_URI_PATH}`
    }
} 