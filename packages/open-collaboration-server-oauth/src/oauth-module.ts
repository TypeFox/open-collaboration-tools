import { ContainerModule } from 'inversify'
import { OAuthEnpoint } from './oauth-endpoint'

export default new ContainerModule(bind => {
    bind(OAuthEnpoint).toSelf().inSingletonScope();
})