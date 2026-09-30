export const villageArtwork = new URL("./assets/economy-village-v1.png", import.meta.url).href;

const roleArtwork = {
  company: new URL("./assets/role-company-v1.png", import.meta.url).href,
  store: new URL("./assets/role-store-v1.png", import.meta.url).href,
  household: new URL("./assets/role-household-v1.png", import.meta.url).href,
};

/** Adjacent headings provide the role name; artwork is decorative. */
export function RoleArtwork({ role }: { role: keyof typeof roleArtwork }) {
  return <img className="role-artwork" src={roleArtwork[role]} alt="" width={80} height={80} />;
}
