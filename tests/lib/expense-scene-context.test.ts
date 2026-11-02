import {it,expect,vi,afterEach} from 'vitest';
import {requestExpenseReply} from '../../src/lib/expense-service';
import type {ExpenseBook} from '../../src/lib/expense-notebook';
import type {SceneContext} from '../../src/lib/scene-context';
afterEach(()=>vi.restoreAllMocks());
it('分摊模型取得同一事项来源事实并明确请客只改参与份额',async()=>{
 const book:ExpenseBook={id:'book',title:'生日聚餐',group:{id:'g',name:'聚餐群',revision:1,members:[{id:'me',name:'我',self:true},{id:'li',name:'李娜'}]},participants:['me','li'],defaultPayerId:'me',entries:[],batches:[],at:1};
 const sceneContext:SceneContext={version:1,sceneId:'birthday',workspaceIds:['birthday','aa'],authorization:'none',facts:[{field:'recipient',value:'王芳',source:{kind:'calendar',id:'calendar-birthday',workspaceId:'birthday',label:'王芳生日日历'}}],conflicts:[],evidence:[{kind:'user_message',id:'message',workspaceId:'birthday',text:'生日聚餐，蛋糕我请，餐费大家平分'}]};
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({output_text:'{"action":"clarify","message":"哪笔蛋糕？"}'})));
 await requestExpenseReply(book,'蛋糕我请',[],{sceneContext});
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
 expect(JSON.stringify(body.input)).toContain('calendar-birthday');expect(JSON.stringify(body.input)).toContain('蛋糕我请');
 expect(body.instructions).toContain('请客');expect(body.instructions).toContain('shares');expect(body.instructions).toContain('不改实付');
});
