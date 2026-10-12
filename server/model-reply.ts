import {fileURLToPath} from 'node:url';
import {createModelConfigStore} from '../mobilegym/server/modelConfig';
import {requestWechatContactReply} from '../mobilegym/server/wechatContactChatProxy';
import type {StewardModelCall} from '../src/lib/steward-chat';
/** Read the same private provider settings as the sandbox proxy on every call.
 * Never return credentials or silently choose another provider. */
export const localStewardModel:StewardModelCall=async payload=>{
 const store=createModelConfigStore(fileURLToPath(new URL('../mobilegym/.sandbox-model.local.json',import.meta.url)),{apiKey:process.env.WECHAT_CONTACT_CHAT_API_KEY||'',baseUrl:process.env.WECHAT_CONTACT_CHAT_BASE_URL||'',model:process.env.WECHAT_CONTACT_CHAT_MODEL||''});
 return requestWechatContactReply(payload,store.get());
};
