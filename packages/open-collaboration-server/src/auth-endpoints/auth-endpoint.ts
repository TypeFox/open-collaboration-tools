import type { Express } from 'express';
import { Event } from 'open-collaboration-rpc';
import { User } from '../types';

export type UserInfo = Omit<User, 'id'>;
export interface AuthSuccessEvent {
    token: string, 
    userInfo: UserInfo
}

export const AuthEndpoint = Symbol('AuthEndpoint');

export interface AuthEndpoint {
    shouldActivate(): boolean;
    onStart(app: Express, hostname: string, port: number): void;
    onDidAuthenticate: Event<AuthSuccessEvent>;
}