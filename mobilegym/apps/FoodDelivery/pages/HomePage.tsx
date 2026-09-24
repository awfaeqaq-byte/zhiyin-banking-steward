import { ChevronDown, Clock3, MapPin, Search, ShoppingBag, Star } from 'lucide-react';
import { FOOD_ASSETS } from '../assets';
import { FOOD_DELIVERY_CONFIG } from '../data';
import { useFoodDeliveryGestures } from '../hooks/useFoodDeliveryGestures';
import { useFoodDeliveryStore } from '../state';

const categories = ['小食快餐', '川湘热炒', '火锅烧烤', '料理西餐', '地方特色', '健康轻食', '茶饮咖啡', '面包甜点'];
const flash = [
  { name: '招牌宫保鸡丁饭', price: 16.8, origin: 25.8, image: FOOD_ASSETS.dishes.kungpao, off: '6.5折' },
  { name: '黑椒牛肉意面', price: 19.9, origin: 29.9, image: FOOD_ASSETS.dishes.pasta, off: '限时抢' },
  { name: '鲜虾小馄饨', price: 12.8, origin: 18.8, image: FOOD_ASSETS.dishes.wonton, off: '今日特价' },
];
const shops = [
  { name: FOOD_DELIVERY_CONFIG.merchant.name, score: 4.8, sales: 1268, distance: '820m', minutes: 32, notice: '新客立减8元 · 满25减5', logo: FOOD_ASSETS.dishes.kungpao, goods: [FOOD_ASSETS.dishes.kungpao, FOOD_ASSETS.dishes.boiledBeef, FOOD_ASSETS.dishes.friedRice] },
  { name: '禾田小灶·家常菜', score: 4.9, sales: 2034, distance: '1.1km', minutes: 35, notice: '老板推荐：现炒下饭菜双拼', logo: FOOD_ASSETS.dishes.friedRice, goods: [FOOD_ASSETS.dishes.friedRice, FOOD_ASSETS.dishes.wonton, FOOD_ASSETS.dishes.noodles] },
  { name: '慢岛意面披萨', score: 4.7, sales: 896, distance: '1.3km', minutes: 38, notice: '满39减12 · 配送费0元', logo: FOOD_ASSETS.dishes.pizza, goods: [FOOD_ASSETS.dishes.pizza, FOOD_ASSETS.dishes.pasta, FOOD_ASSETS.dishes.cake] },
];

export function HomePage() {
  const { bindTap } = useFoodDeliveryGestures();
  const count = useFoodDeliveryStore(state => state.cart.reduce((sum, line) => sum + line.quantity, 0));
  const merchantId = FOOD_DELIVERY_CONFIG.merchant.id;
  return <main data-status-bar-foreground="dark" className="min-h-full pb-24 bg-[#f4f5f7] text-[#202126]">
    <header className="relative overflow-hidden pt-10 pb-4 bg-[linear-gradient(180deg,#ffe4ea_0%,#fff5f7_72%,#f4f5f7_100%)]">
      <img src={FOOD_ASSETS.homePoster} alt="" className="absolute right-0 top-0 h-full w-[62%] object-cover object-right pointer-events-none" />
      <div className="relative z-10 px-5 pt-2 w-[64%]"><h1 className="text-[25px] leading-tight font-black tracking-wide text-[#ff2d55] drop-shadow-[0_2px_6px_rgba(255,255,255,.9)]">好食送外卖</h1><p className="mt-1 text-[11px] text-[#65656a]">假装点外卖，真的攒下钱</p></div>
      <div className="relative z-10 mt-3 px-5 flex items-center font-extrabold text-[14px]"><MapPin size={15} fill="#ff2d55" color="#ff2d55" className="mr-1" /><span className="max-w-[72%] truncate">江湾金融中心 A 座</span><ChevronDown size={14} className="ml-1 text-[#666]" /></div>
      <div className="relative z-20 mt-2 px-3"><div className="h-11 rounded-full bg-white flex items-center pl-4 pr-1.5 shadow-[0_8px_28px_rgba(255,45,85,.12)]"><Search size={17} className="text-[#999] mr-2" /><span className="flex-1 truncate text-[12px] text-[#aaa]">大家都在搜「干拌麻辣烫」</span><span className="h-8 px-5 rounded-full bg-[#ff2d55] text-white text-[12px] font-bold grid place-items-center">搜索</span></div></div>
    </header>

    <section className="mx-3 bg-white rounded-[18px] pt-4 px-1 pb-2 grid grid-cols-4 gap-y-3">{categories.map((label, index) => <div key={label} className="text-center"><img src={FOOD_ASSETS.categories[index]} alt="" className="mx-auto w-[50px] h-[50px] rounded-full object-cover bg-[#f3f3f3]" /><div className="mt-1.5 text-[11px] text-[#444]">{label}</div></div>)}</section>

    <section className="mx-3 mt-3 rounded-[18px] overflow-hidden bg-[linear-gradient(180deg,#ff3d63_0%,#ff6b86_35%,#fff_35%)] pt-3 pb-3"><div className="px-4 pb-3 text-white flex items-center justify-between"><strong className="text-[17px]">限时馋抢购</strong><span className="text-[10px] opacity-90">每日限量 · 抢完不补</span></div><div className="flex gap-2.5 overflow-x-auto no-scrollbar px-3">{flash.map(item => <button key={item.name} className="relative flex-none w-[124px] text-left bg-white rounded-[14px] p-1.5" {...bindTap<HTMLButtonElement>('fooddelivery.home.openMerchant', { params: { merchantId } })}><img src={item.image} alt="" className="w-full aspect-square rounded-[10px] object-cover" /><div className="mt-1.5 truncate text-[11px] font-bold">{item.name}</div><div className="mt-0.5 flex items-baseline gap-1"><strong className="text-[#ff2d55] text-[16px]">¥{item.price}</strong><del className="text-[9px] text-[#bbb]">¥{item.origin}</del></div><span className="absolute left-1.5 top-1.5 rounded-tl-[10px] rounded-br-[10px] bg-[#ff2d55] text-white text-[9px] px-1.5 py-0.5">{item.off}</span></button>)}</div></section>

    <section className="px-3 mt-5"><div className="flex items-end justify-between mb-3"><h2 className="font-black text-[19px]">附近商家</h2><div className="text-[10px] text-[#777] flex gap-3"><span className="text-[#ff2d55] font-bold">综合排序</span><span>销量优先</span><span>距离最近</span></div></div>{shops.map((shop, shopIndex) => <button key={shop.name} className="mb-3 w-full text-left bg-white rounded-[18px] p-3" {...bindTap<HTMLButtonElement>('fooddelivery.home.openMerchant', { params: { merchantId } })}><div className="flex gap-3"><img src={shop.logo} alt="" className="w-[72px] h-[72px] rounded-[12px] object-cover flex-none" /><div className="flex-1 min-w-0"><h3 className="font-extrabold text-[15px] truncate">{shop.name}</h3><div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-[#888]"><span className="text-[#ff8a00] font-bold flex items-center gap-0.5"><Star size={10} fill="currentColor" />{shop.score}</span><span>月售 {shop.sales}</span><span>{shop.distance}</span><span className="flex items-center gap-0.5"><Clock3 size={10} />{shop.minutes}分钟</span></div><div className="mt-2 rounded-lg bg-[#fff4e8] text-[#c87a2a] text-[10px] px-2 py-1.5 truncate">{shop.notice}</div></div></div><div className="mt-2.5 ml-[84px] flex gap-2 overflow-hidden">{shop.goods.map((image, index) => <div key={image} className="w-[68px] flex-none"><div className="relative"><img src={image} alt="" className="w-[68px] h-[58px] rounded-lg object-cover" />{index === 0 && <span className="absolute left-0 top-0 text-[8px] rounded-tl-lg rounded-br-lg bg-[#ff7a3d] text-white px-1.5 py-0.5">{shopIndex ? '推荐' : '热销'}</span>}</div></div>)}</div></button>)}</section>

    <button aria-label="购物车" className="fixed right-4 bottom-6 z-40 w-[54px] h-[54px] rounded-full text-white bg-[linear-gradient(180deg,#ff5d78,#ff2d55)] shadow-[0_10px_25px_rgba(255,45,85,.3)] grid place-items-center" {...bindTap<HTMLButtonElement>('fooddelivery.home.openCart')}><ShoppingBag size={25} />{count > 0 && <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-[#ff334e] border-2 border-white text-[10px] grid place-items-center">{count}</span>}</button>
  </main>;
}
