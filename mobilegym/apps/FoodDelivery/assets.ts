import homePoster from './assets/home-poster.jpg';
import friedRice from './assets/food-fried-rice.jpg';
import kungpao from './assets/food-kungpao.jpg';
import boiledBeef from './assets/food-boiled-beef.jpg';
import noodles from './assets/food-noodles.jpg';
import milkTea from './assets/food-milktea.jpg';
import cake from './assets/food-cake.jpg';
import pizza from './assets/food-pizza.jpg';
import wonton from './assets/food-shrimp-wonton.jpg';
import pasta from './assets/food-tomato-pasta.jpg';
import bar from './assets/food-bar.jpg';
import healthy from './assets/cat-healthy.jpg';
import local from './assets/cat-local.jpg';
import sichuan from './assets/cat-sichuan.jpg';
import tea from './assets/cat-tea.jpg';
import dessert from './assets/cat-dessert.jpg';
import bbq from './assets/cat-bbq.jpg';
import western from './assets/cat-western.jpg';

export const FOOD_ASSETS = {
  homePoster,
  categories: [local, sichuan, bbq, western, healthy, tea, dessert, bar],
  dishes: { friedRice, kungpao, boiledBeef, noodles, milkTea, cake, pizza, wonton, pasta, bar },
} as const;

const PRODUCT_IMAGE: Record<string, string> = {
  'meal-chicken-01': kungpao,
  'meal-beef-01': boiledBeef,
  'meal-fish-01': friedRice,
  'meal-tofu-01': noodles,
  'drink-plum-01': milkTea,
  'side-egg-01': wonton,
};

export function productImage(productId: string) {
  return PRODUCT_IMAGE[productId] ?? friedRice;
}
