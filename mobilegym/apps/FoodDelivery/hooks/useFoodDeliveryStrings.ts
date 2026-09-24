import { useAppStrings } from '../../../os/useAppStrings';
import { strings } from '../res/strings';
import { stringsEn } from '../res/strings.en';

export function useFoodDeliveryStrings() {
  return useAppStrings(strings, stringsEn);
}
