// Corners are 0 everywhere except intrinsically round things (icon buttons,
// radios, switches, rings) — those use `full`, computed per-component from
// their own size (borderRadius: size / 2), not a fixed constant.
export const radius = {
  0: 0,
  xs: 2,
  sm: 4,
  full: 999,
  control: 0,
  card: 0,
  device: 44, // reference only — the phone bezel is not ported
};

export default radius;
