'use client';

export type PosProduct = {
  id: string;
  name: string;
  price: number;
  category_id?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
  [key: string]: any;
};
