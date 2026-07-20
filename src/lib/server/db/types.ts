export interface User {
  id: string;
  oidcSub: string | null;
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: number;
}
