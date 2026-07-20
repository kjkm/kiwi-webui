import type { User } from '$lib/server/db/types';

declare global {
  namespace App {
    interface Locals {
      user: User | null;
      sessionToken: string | null;
    }
    interface PageData {
      user?: User | null;
    }
  }
}

export {};
