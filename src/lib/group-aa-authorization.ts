/** Includes the old bridge text so persisted tasks can recover after upgrading. */
export const groupAAAuthorizationMessage = '此活动的微信群尚未授权，收款进度已暂停更新。';
export const groupAAAuthorizedEvent = 'zhiyin-group-aa-authorized';
export function isGroupAAAuthorizationRequired(value: unknown): boolean {
 const message = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
 return /此群授权已失效|此活动的微信群尚未授权|请重新授权此群的成员信息/.test(message);
}
