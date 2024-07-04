import { inject, injectable } from "inversify";
import { type Express } from 'express';
import { Emitter, Event } from "open-collaboration-rpc";
import { AuthEndpoint, AuthSuccessEvent, UserInfo } from "./auth-endpoint";
import passport from 'passport';
import { Strategy as GithubStrategy } from "passport-github";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Logger, LoggerSymbol } from "../utils/logging";

export const oauthProviders = Symbol('oauthProviders');

@injectable()
export abstract class OAuthEndpoint implements AuthEndpoint {
    @inject(LoggerSymbol)
    protected logger: Logger;

    protected abstract id: string;
    protected abstract path: string
    protected abstract redirectPath: string
    protected scope?: string;
   
    private authSuccessEmitter = new Emitter<AuthSuccessEvent>();
    onDidAuthenticate: Event<AuthSuccessEvent> = this.authSuccessEmitter.event;


    abstract shouldActivate(): boolean;
    abstract getStrategy(host: string, port: number): passport.Strategy;


    onStart(app: Express, hostname: string, port: number): void {
        passport.use(this.id, this.getStrategy(hostname, port));


        app.get(this.path, async (req, res) => {
            const token = req.query.token;
            if (!token) {
                this.logger.error('missing token parameter in request');
                res.status(400);
                res.send('Error: Missing token parameter in request');
                return;
            }
            passport.authenticate(this.id, { state: `${token}`, scope: this.scope })(req, res);
        });

        app.get(this.redirectPath, async (req, res) => {
            const token = (req.query.state as string)
            if(!token) {
                this.logger.error('missing token in request state');
                res.status(400);
                res.send(`Error: Missing token in request state`);
                return;
            }
            passport.authenticate(this.id, { state: token, scope: this.scope }, async (err: any, userInfo?: UserInfo) => {
                if(err || !userInfo) {
                    this.logger.error('Error retrieving user info', err);
                    res.status(400);
                    res.send('Error retrieving user info');
                    return;
                }
                try {
                    await Promise.all(this.authSuccessEmitter.fire({token, userInfo}));
                } catch (err) {
                    this.logger.error('Error during login', err);
                    res.status(500);
                    res.send('Internal server error occured during Login. Please try again');
                    return;
                }
                res.status(200);
                res.send('Login Successful. You can close this page');
            })(req, res);
        });

    }

    protected createRedirectUrl(host: string, port: number, path: string): string {
        const baseURL = process.env.OCT_BASE_URL ?? `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`
        return new URL(path, baseURL).toString();
    }
}

@injectable()
export class GitHubOAuthEndpoint  extends OAuthEndpoint {
    protected id = 'github';
    protected path = '/api/login/github'
    protected redirectPath = '/api/login/github-callback'


    shouldActivate(): boolean {
        return Boolean(process.env.OCT_OAUTH_GITHUB_CLIENTID && process.env.OCT_OAUTH_GITHUB_CLIENTSECRET)
    }

    override getStrategy(hostname: string, port: number): passport.Strategy {
        return new GithubStrategy({
            clientID: process.env.OCT_OAUTH_GITHUB_CLIENTID as string,
            clientSecret: process.env.OCT_OAUTH_GITHUB_CLIENTSECRET as string,
            callbackURL: this.createRedirectUrl(hostname, port, this.redirectPath),
        }, (accessToken, refreshToken, profile, done) => {
            done(undefined, { name: profile.displayName, email: profile.emails?.[0], authProvider: 'Github' } as UserInfo)
        });
    }
} 


@injectable()
export class GoogleOAuthEndpoint extends OAuthEndpoint {
    protected id = 'google';
    protected path = '/api/login/google'
    protected redirectPath = '/api/login/google-callback'


    shouldActivate(): boolean {
        return Boolean(process.env.OCT_OAUTH_GOOGLE_CLIENTID && process.env.OCT_OAUTH_GOOGLE_CLIENTSECRET)
    }

    override getStrategy(hostname: string, port: number): passport.Strategy {
        return new GoogleStrategy({
            clientID: process.env.OCT_OAUTH_GOOGLE_CLIENTID as string,
            clientSecret: process.env.OCT_OAUTH_GOOGLE_CLIENTSECRET as string,
            callbackURL: this.createRedirectUrl(hostname, port, this.redirectPath),
        }, (accessToken, refreshToken, profile, done) => {
            done(undefined, { name: profile.displayName, email: profile.emails?.find(mail => mail.verified)?.value, authProvider: 'Google' } as UserInfo)
        });
    }
} 