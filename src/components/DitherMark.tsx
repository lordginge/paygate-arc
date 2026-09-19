/**
 * The Dither Gateway mark: an abstract arched portal rendered as an ordered
 * (Bayer) dither pixel grid, Gate Blue on Ink. Drawn as merged SVG paths,
 * one per palette step, so it stays pixel-crisp from favicon to hero size.
 */
export function DitherMark({
  size = 20,
  className,
  rounded = true,
}: {
  size?: number;
  className?: string;
  rounded?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      {rounded && <rect width="36" height="36" rx="7" fill="#050505" />}
      <path
        fill="#16255C"
        d="M15 0h1v1h-1zM23 0h1v1h-1zM8 1h1v1h-1zM10 1h1v1h-1zM12 1h1v1h-1zM14 1h1v1h-1zM16 1h1v1h-1zM18 1h1v1h-1zM20 1h1v1h-1zM22 1h1v1h-1zM24 1h1v1h-1zM26 1h1v1h-1zM28 1h1v1h-1zM9 2h1v1h-1zM13 2h1v1h-1zM17 2h1v1h-1zM21 2h1v1h-1zM25 2h1v1h-1z
          M8 3h1v1h-1zM10 3h1v1h-1zM12 3h1v1h-1zM14 3h1v1h-1zM16 3h1v1h-1zM18 3h1v1h-1zM20 3h1v1h-1zM22 3h1v1h-1zM24 3h1v1h-1zM26 3h1v1h-1zM28 3h1v1h-1zM11 4h1v1h-1zM15 4h1v1h-1zM19 4h1v1h-1zM23 4h1v1h-1zM27 4h1v1h-1zM8 5h1v1h-1zM10 5h1v1h-1z
          M12 5h1v1h-1zM14 5h1v1h-1zM16 5h1v1h-1zM18 5h1v1h-1zM20 5h1v1h-1zM22 5h1v1h-1zM24 5h1v1h-1zM26 5h1v1h-1zM28 5h1v1h-1zM9 6h1v1h-1zM13 6h1v1h-1zM15 6h1v1h-1zM17 6h1v1h-1zM19 6h1v1h-1zM21 6h1v1h-1zM25 6h1v1h-1zM8 7h1v1h-1zM10 7h1v1h-1z
          M12 7h1v1h-1zM14 7h1v1h-1zM16 7h1v1h-1zM18 7h1v1h-1zM20 7h1v1h-1zM22 7h1v1h-1zM24 7h1v1h-1zM26 7h1v1h-1zM28 7h1v1h-1zM11 8h1v1h-1zM13 8h1v1h-1zM15 8h1v1h-1zM17 8h1v1h-1zM19 8h1v1h-1zM21 8h1v1h-1zM23 8h1v1h-1zM25 8h1v1h-1zM27 8h1v1h-1z
          M8 9h1v1h-1zM10 9h15v1h-15zM26 9h1v1h-1zM28 9h1v1h-1zM9 10h1v1h-1zM11 10h1v1h-1zM13 10h1v1h-1zM15 10h1v1h-1zM17 10h1v1h-1zM19 10h1v1h-1zM21 10h1v1h-1zM23 10h1v1h-1zM25 10h1v1h-1zM27 10h1v1h-1zM8 11h1v1h-1zM10 11h1v1h-1zM12 11h13v1h-13zM26 11h1v1h-1z
          M28 11h1v1h-1zM9 12h1v1h-1zM11 12h1v1h-1zM13 12h11v1h-11zM25 12h1v1h-1zM27 12h1v1h-1zM8 13h6v1h-6zM15 13h1v1h-1zM17 13h1v1h-1zM19 13h1v1h-1zM21 13h1v1h-1zM23 13h6v1h-6zM9 14h1v1h-1zM11 14h6v1h-6zM18 14h8v1h-8zM27 14h1v1h-1zM8 15h4v1h-4zM13 15h1v1h-1z
          M15 15h1v1h-1zM17 15h1v1h-1zM19 15h1v1h-1zM21 15h1v1h-1zM23 15h1v1h-1zM25 15h4v1h-4zM9 16h6v1h-6zM16 16h1v1h-1zM18 16h1v1h-1zM20 16h1v1h-1zM22 16h1v1h-1zM24 16h4v1h-4zM8 17h2v1h-2zM11 17h1v1h-1zM13 17h1v1h-1zM25 17h1v1h-1zM27 17h2v1h-2zM8 18h5v1h-5z
          M14 18h1v1h-1zM16 18h1v1h-1zM18 18h1v1h-1zM22 18h1v1h-1zM24 18h5v1h-5zM8 19h4v1h-4zM23 19h1v1h-1zM25 19h4v1h-4zM8 20h3v1h-3zM12 20h1v1h-1zM24 20h1v1h-1zM26 20h3v1h-3zM9 21h1v1h-1zM25 21h1v1h-1zM27 21h1v1h-1zM8 22h3v1h-3zM12 22h1v1h-1zM14 22h1v1h-1z
          M22 22h1v1h-1zM24 22h1v1h-1zM26 22h3v1h-3zM9 23h1v1h-1zM11 23h1v1h-1zM25 23h1v1h-1zM27 23h1v1h-1zM8 24h3v1h-3zM12 24h1v1h-1zM24 24h1v1h-1zM26 24h1v1h-1zM28 24h1v1h-1zM9 25h1v1h-1zM25 25h1v1h-1zM27 25h1v1h-1zM8 26h3v1h-3zM12 26h1v1h-1zM14 26h1v1h-1z
          M22 26h1v1h-1zM24 26h1v1h-1zM26 26h3v1h-3zM9 27h1v1h-1zM11 27h1v1h-1zM25 27h1v1h-1zM27 27h1v1h-1zM8 28h3v1h-3zM12 28h1v1h-1zM24 28h1v1h-1zM26 28h1v1h-1zM28 28h1v1h-1zM9 29h1v1h-1zM11 29h1v1h-1zM25 29h1v1h-1zM27 29h1v1h-1zM8 30h5v1h-5zM14 30h1v1h-1z
          M16 30h1v1h-1zM18 30h1v1h-1zM20 30h1v1h-1zM22 30h1v1h-1zM24 30h1v1h-1zM26 30h3v1h-3zM8 31h2v1h-2zM11 31h1v1h-1zM13 31h1v1h-1zM15 31h1v1h-1zM23 31h1v1h-1zM25 31h1v1h-1zM27 31h2v1h-2zM8 32h3v1h-3zM12 32h1v1h-1zM14 32h1v1h-1zM16 32h1v1h-1zM18 32h1v1h-1z
          M20 32h1v1h-1zM22 32h1v1h-1zM24 32h5v1h-5zM8 33h2v1h-2zM11 33h1v1h-1zM13 33h1v1h-1zM15 33h1v1h-1zM17 33h1v1h-1zM21 33h1v1h-1zM23 33h1v1h-1zM25 33h1v1h-1zM27 33h2v1h-2zM9 34h1v1h-1zM11 34h6v1h-6zM18 34h8v1h-8zM27 34h1v1h-1z"
      />
      <path
        fill="#2A4EC9"
        d="M14 13h1v1h-1zM16 13h1v1h-1zM18 13h1v1h-1zM20 13h1v1h-1zM22 13h1v1h-1zM17 14h1v1h-1zM12 15h1v1h-1zM14 15h1v1h-1zM16 15h1v1h-1zM18 15h1v1h-1zM20 15h1v1h-1zM22 15h1v1h-1zM24 15h1v1h-1zM15 16h1v1h-1zM17 16h1v1h-1zM19 16h1v1h-1zM21 16h1v1h-1zM23 16h1v1h-1z
          M10 17h1v1h-1zM12 17h1v1h-1zM14 17h11v1h-11zM26 17h1v1h-1zM13 18h1v1h-1zM15 18h1v1h-1zM17 18h1v1h-1zM19 18h3v1h-3zM23 18h1v1h-1zM12 19h11v1h-11zM24 19h1v1h-1zM11 20h1v1h-1zM13 20h6v1h-6zM20 20h4v1h-4zM25 20h1v1h-1zM8 21h1v1h-1zM10 21h4v1h-4zM15 21h1v1h-1z
          M17 21h1v1h-1zM21 21h1v1h-1zM23 21h2v1h-2zM26 21h1v1h-1zM28 21h1v1h-1zM11 22h1v1h-1zM13 22h1v1h-1zM15 22h2v1h-2zM18 22h1v1h-1zM20 22h2v1h-2zM23 22h1v1h-1zM25 22h1v1h-1zM8 23h1v1h-1zM10 23h1v1h-1zM12 23h4v1h-4zM17 23h1v1h-1zM19 23h1v1h-1zM21 23h4v1h-4z
          M26 23h1v1h-1zM28 23h1v1h-1zM11 24h1v1h-1zM13 24h4v1h-4zM18 24h1v1h-1zM20 24h4v1h-4zM25 24h1v1h-1zM27 24h1v1h-1zM8 25h1v1h-1zM10 25h4v1h-4zM15 25h1v1h-1zM17 25h1v1h-1zM19 25h1v1h-1zM21 25h1v1h-1zM23 25h2v1h-2zM26 25h1v1h-1zM28 25h1v1h-1zM11 26h1v1h-1z
          M13 26h1v1h-1zM15 26h7v1h-7zM23 26h1v1h-1zM25 26h1v1h-1zM8 27h1v1h-1zM10 27h1v1h-1zM12 27h4v1h-4zM17 27h3v1h-3zM21 27h4v1h-4zM26 27h1v1h-1zM28 27h1v1h-1zM11 28h1v1h-1zM13 28h11v1h-11zM25 28h1v1h-1zM27 28h1v1h-1zM8 29h1v1h-1zM10 29h1v1h-1zM12 29h6v1h-6z
          M19 29h6v1h-6zM26 29h1v1h-1zM28 29h1v1h-1zM13 30h1v1h-1zM15 30h1v1h-1zM17 30h1v1h-1zM19 30h1v1h-1zM21 30h1v1h-1zM23 30h1v1h-1zM25 30h1v1h-1zM10 31h1v1h-1zM12 31h1v1h-1zM14 31h1v1h-1zM16 31h7v1h-7zM24 31h1v1h-1zM26 31h1v1h-1zM11 32h1v1h-1zM13 32h1v1h-1z
          M15 32h1v1h-1zM17 32h1v1h-1zM19 32h1v1h-1zM21 32h1v1h-1zM23 32h1v1h-1zM10 33h1v1h-1zM12 33h1v1h-1zM14 33h1v1h-1zM16 33h1v1h-1zM18 33h3v1h-3zM22 33h1v1h-1zM24 33h1v1h-1zM26 33h1v1h-1zM17 34h1v1h-1z"
      />
      <path
        fill="#3B6DFF"
        d="M19 20h1v1h-1zM14 21h1v1h-1zM16 21h1v1h-1zM18 21h3v1h-3zM22 21h1v1h-1zM17 22h1v1h-1zM19 22h1v1h-1zM16 23h1v1h-1zM18 23h1v1h-1zM20 23h1v1h-1zM17 24h1v1h-1zM19 24h1v1h-1zM14 25h1v1h-1zM16 25h1v1h-1zM18 25h1v1h-1zM20 25h1v1h-1zM22 25h1v1h-1zM16 27h1v1h-1z
          M20 27h1v1h-1zM18 29h1v1h-1z"
      />
    </svg>
  );
}
