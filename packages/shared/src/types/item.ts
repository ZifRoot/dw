export interface Item {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreateItemDto {
  name: string;
}