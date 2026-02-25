export interface ElementInfoField {
  label: string;
  value: string;
}

export interface ElementInfoData {
  source: "scene" | "projectTree";
  expressID: number;
  fields: ElementInfoField[];
}
