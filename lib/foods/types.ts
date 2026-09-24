export const MENU_VOCAB = [
  "burger",
  "pizza",
  "pasta",
  "sandwich",
  "sushi",
  "rice-bowl",
  "noodle-bowl",
  "soup",
  "porridge",
  "salad",
  "fried-chicken",
  "grill",
  "dessert",
  "bakery",
  "coffee",
  "beverage",
] as const;

export type MenuValue = (typeof MENU_VOCAB)[number];

export const PRICE_TIER_VOCAB = ["budget", "regular", "premium", "splurge"] as const;

export type PriceTier = (typeof PRICE_TIER_VOCAB)[number];

export const SERVING_VOCAB = ["meal", "snack"] as const;

export type Serving = (typeof SERVING_VOCAB)[number];

export const INGREDIENT_VOCAB = [
  "rice",
  "noodles",
  "bread",
  "potato",
  "porridge",
  "none",
  "chicken",
  "beef",
  "seafood",
  "egg",
  "plant",
  "pork",
  "mixed",
] as const;

export type IngredientValue = (typeof INGREDIENT_VOCAB)[number];

export const ORIGIN_VOCAB = [
  "indonesian",
  "chinese",
  "japanese",
  "korean",
  "western",
  "middle-eastern",
  "southeast-asian",
  "mixed",
] as const;

export type OriginValue = (typeof ORIGIN_VOCAB)[number];

export const HEALTH_STYLE_VOCAB = ["comfort", "everyday", "fresh"] as const;

export type HealthStyle = (typeof HEALTH_STYLE_VOCAB)[number];

export interface FoodTags {
  // Open vocabulary (registry values included): any 1-24 char string.
  // The *Value union types below still describe the built-in defaults.
  healthStyle?: string;
  ingredients: string[];
  menus: string[];
  open: Record<string, string[]>;
  origins: string[];
  pending: string[];
  priceTier?: string;
  servings: string[];
}

export interface FoodPlace {
  areas: string[];
  id: string;
  instagramUrl?: string;
  name: string;
  tags: FoodTags;
  tiktokUrl?: string;
}
