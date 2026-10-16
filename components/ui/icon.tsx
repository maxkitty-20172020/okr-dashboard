export function Icon({ name }: { name: "password" | "guide" | "logout" }) {
  const paths = { password: "M8 10V7a4 4 0 0 1 8 0v3M6 10h12v11H6zM12 14v3", guide: "M4 3h16v18H4zM8 7h8M8 11h8M8 15h5", logout: "M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
