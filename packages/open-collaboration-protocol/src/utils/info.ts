import { isObject } from "./types";

export interface Info {
    code: string;
    params: string[];
    message: string;
}

export namespace Info {
    export function is(arg: unknown): arg is Info {
        return isObject<Info>(arg)
            && typeof arg.code === 'string'
            && typeof arg.message === 'string'
            && Array.isArray(arg.params)
            && arg.params.every(param => typeof param === 'string');
    }
}
