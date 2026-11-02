export interface PublicActivity { days: Record<string, number>; streak: number; today?: string }
export interface PublicRating { control: string; rating: number; games: number; deviation?: number }
export interface PublicPlayerProfile {
  username: string;
  activityPublic: boolean;
  ratings: PublicRating[];
  activity?: PublicActivity;
}
export interface InitialPublicProfile {
  username: string;
  data: PublicPlayerProfile | null;
  missing: boolean;
}
