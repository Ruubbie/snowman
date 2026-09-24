// Cool blue-grey, long & soft shadows — 1:1 from design/olaf-ds/tokens.css
// (effects.css). Web gets the exact CSS box-shadow string; native gets an
// equivalent iOS shadow* + Android elevation approximation.
import { Platform } from 'react-native';

function shadow({ webBoxShadow, color, offsetY, opacity, radius: blurRadius, elevation: androidElevation }) {
  return Platform.select({
    web: { boxShadow: webBoxShadow },
    default: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: blurRadius,
      elevation: androidElevation,
    },
  });
}

export const elevation = {
  none: Platform.select({ web: { boxShadow: 'none' }, default: { shadowOpacity: 0, elevation: 0 } }),
  hair: shadow({ webBoxShadow: '0 1px 0 rgba(27,34,44,.06)', color: '#1B222C', offsetY: 1, opacity: 0.06, radius: 0, elevation: 1 }),
  soft: shadow({ webBoxShadow: '0 10px 30px -12px rgba(43,62,86,.14)', color: '#2B3E56', offsetY: 10, opacity: 0.14, radius: 20, elevation: 4 }),
  float: shadow({ webBoxShadow: '0 18px 40px -16px rgba(43,62,86,.22)', color: '#2B3E56', offsetY: 18, opacity: 0.22, radius: 28, elevation: 8 }),
  drift: shadow({ webBoxShadow: '0 40px 80px -30px rgba(43,62,86,.28)', color: '#2B3E56', offsetY: 32, opacity: 0.28, radius: 44, elevation: 14 }),
  // legacy aliases
  card: shadow({ webBoxShadow: '0 10px 30px -12px rgba(43,62,86,.14)', color: '#2B3E56', offsetY: 10, opacity: 0.14, radius: 20, elevation: 4 }),
  raised: shadow({ webBoxShadow: '0 18px 40px -16px rgba(43,62,86,.22)', color: '#2B3E56', offsetY: 18, opacity: 0.22, radius: 28, elevation: 8 }),
};

export default elevation;
