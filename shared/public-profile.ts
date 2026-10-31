export type PublicActivity = { days: Record<string, number>; streak: number; today?: string };
export type PublicRating = { control: string; rating: number; games: number; deviation?: number };
export type PublicPlayerProfile = { username: string; activityPublic: boolean; ratings: PublicRating[]; activity?: PublicActivity };
export type InitialPublicProfile = { username: string; data: PublicPlayerProfile | null; missing: boolean };
