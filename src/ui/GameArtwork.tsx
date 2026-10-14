export const villageArtwork = new URL("./assets/metropolis-pixel-v1.png", import.meta.url).href;

const roleArtwork = {
  company: "15% 58%",
  store: "50% 39%",
  household: "32% 13%",
};

/** Adjacent headings provide the role name; artwork is decorative. */
export function RoleArtwork({ role }: { role: keyof typeof roleArtwork }) {
  return <span className="role-artwork pixel-role-artwork" aria-hidden="true" style={{backgroundImage: `url(${villageArtwork})`, backgroundPosition: roleArtwork[role]}} />;
}
