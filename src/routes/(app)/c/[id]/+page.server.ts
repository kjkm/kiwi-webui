import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => ({ requestedChatId: params.id });
