export interface Game {
  id: string
  league: string
  home_team: string
  away_team: string
  starts_at: string
  status: string
  home_score: number | null
  away_score: number | null
  season: string | null
  updated_at: string
}

export interface Log {
  id: string
  user_id: string
  game_id: string
  watched_via: string | null
  review: string | null
  reaction: string | null
  spoiler_free: boolean
  created_at: string
  game: Game
}

export interface RankEntry {
  id: string
  user_id: string
  game_id: string
  score: number
  created_at: string
  game: Game
}

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  favorite_team: string | null
  bio: string | null
  created_at: string
}

export interface Watchlist {
  id: string
  user_id: string
  game_id: string
  created_at: string
  game: Game
}
