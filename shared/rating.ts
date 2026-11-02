/** Glickman, Glicko-2 algorithm, March 2022. Each match is one rating period. */
export interface Rating { rating: number; deviation: number; volatility: number; games: number }
export function initialRating(): Rating  { return ({
  rating: 1500,
  deviation: 350,
  volatility: 0.06,
  games: 0,
}); }
export function rate(
  player: Rating,
  opponents: { rating: Rating; score: number }[],
  tau = 0.5,
): Rating {
  if (
    ![player.rating, player.deviation, player.volatility, tau].every(Number.isFinite) ||
    player.deviation <= 0 ||
    player.volatility <= 0 ||
    tau <= 0
  )
    {throw new Error('invalid_rating');}
  const scale = 173.7178;
    const mu = (player.rating - 1500) / scale;
    const phi = player.deviation / scale;
  if (opponents.length === 0)
    {return {
      ...player,
      deviation: Math.min(350, scale * Math.sqrt(phi * phi + player.volatility ** 2)),
    };}
  let improvement = 0,
    variance = 0;
  for (const opponent of opponents) {
    if (
      ![0, 0.5, 1].includes(opponent.score) ||
      !Number.isFinite(opponent.rating.rating) ||
      !(opponent.rating.deviation > 0)
    )
      {throw new Error('invalid_score');}
    const g = 1 / Math.sqrt(1 + (3 * (opponent.rating.deviation / scale) ** 2) / Math.PI ** 2);
    const expected = 1 / (1 + Math.exp(-g * (mu - (opponent.rating.rating - 1500) / scale)));
    variance += g * g * expected * (1 - expected);
    improvement += g * (opponent.score - expected);
  }
  const v = 1 / variance;
    const delta = v * improvement;
    const a = Math.log(player.volatility ** 2);
  function f(x: number) {
    return (
      (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) /
      (2 * (phi * phi + v + Math.exp(x)) ** 2) -
      (x - a) / tau ** 2
    );
  }
  let A = a;
    let B: number;
  if (delta * delta > phi * phi + v) {B = Math.log(delta * delta - phi * phi - v);}
  else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 1000) {k++;}
    B = a - k * tau;
  }
  let fA = f(A);
    let fB = f(B);
    let iterations = 0;
  while (Math.abs(B - A) > 0.000001) {
    if (++iterations > 1000) {throw new Error('rating_convergence');}
    const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {fA /= 2;}
    B = C;
    fB = fC;
  }
  const volatility = Math.exp(A / 2);
    const pre = Math.sqrt(phi * phi + volatility * volatility);
  const deviation = 1 / Math.sqrt(1 / (pre * pre) + 1 / v);
  return {
    rating: 1500 + scale * (mu + deviation * deviation * improvement),
    deviation: Math.min(350, scale * deviation),
    volatility,
    games: player.games + opponents.length,
  };
}
export function rateMatch(white: Rating, black: Rating, winner: 'w' | 'b' | null) {
  const score = winner === null ? 0.5 : (winner === 'w' ? 1 : 0);
  return {
    w: rate(white, [{ rating: black, score }]),
    b: rate(black, [{ rating: white, score: 1 - score }]),
  };
}
export function provisional(rating: Rating) { return rating.games < 10; }
