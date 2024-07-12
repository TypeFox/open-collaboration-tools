export const packageJson = require('../../package.json');
export const packageVersion: string = packageJson.version;
export const userColors: string[] = packageJson.contributes.colors
    .map((color: any) => color.id)
    .filter((id: string) => id.startsWith('oct.user.'));
