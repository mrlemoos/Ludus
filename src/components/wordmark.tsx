import { Link } from 'react-router';

/** Shared lettering and proportions for every Ludus wordmark. */
interface WordmarkProps {
  decorative?: boolean;
}

export function Wordmark({ decorative = false }: WordmarkProps) {
  const lettering = (
    <>
      ludus<span aria-hidden="true">.</span>
    </>
  );
  return decorative ? (
    <span className="wordmark" aria-hidden="true">
      {lettering}
    </span>
  ) : (
    <Link to="/" className="wordmark" aria-label="Ludus">
      {lettering}
    </Link>
  );
}
