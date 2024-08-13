import { l10n } from 'vscode';
import { Info } from "open-collaboration-protocol";

export function localizeInfo(info: Info): string {
    switch (info.code) {
        case Info.Codes.AuthInternalError:
            return l10n.t('Internal authentication server error');
        case Info.Codes.AuthTimeout:
            return l10n.t('Authentication timed out');
        case Info.Codes.AwaitingServerResponse:
            return l10n.t('Awaiting server response');
        case Info.Codes.IncompatibleProtocolVersions:
            return l10n.t('Incompatible protocol versions: client {0}, server {1}', ...info.params);
        case Info.Codes.InvalidServerVersion:
            return l10n.t('Invalid protocol version returned by server: {0}', ...info.params);
        case Info.Codes.JoinRejected:
            return l10n.t('Join request has been rejected');
        case Info.Codes.JoinRequestNotFound:
            return l10n.t('Join request not found');
        case Info.Codes.JoinTimeout:
            return l10n.t('Join request timed out');
        case Info.Codes.PerformingLogin:
            return l10n.t('Performing login');
        case Info.Codes.RoomNotFound:
            return l10n.t('Session not found');
        case Info.Codes.WaitingForHost:
            return l10n.t('Waiting for host to accept join request');
    }
    return info.message;
}
