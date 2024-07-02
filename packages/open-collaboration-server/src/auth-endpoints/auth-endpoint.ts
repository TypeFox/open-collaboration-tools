import type { Express } from 'express';
import { Event } from 'open-collaboration-rpc';

export interface UserInfo {
    name: string, 
    email?: string 
    authProvider?: string
}

export interface AuthSuccessEvent {
    token: string, 
    userInfo: UserInfo
}

export const AuthEndpoint = Symbol('AuthEndpoint');

export interface AuthEndpoint {
    shouldActivate(): boolean;
    onStart(app: Express, hostname: string, port: number): void;
    onDidSuccessfullyAuthenticate: Event<AuthSuccessEvent>;
}