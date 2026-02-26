export interface ElementInfoField {
  label: string;
  value: string;
}

export interface RelatedElementItem {
  expressID: number;
  name: string;
  typeName: string;
  relation: string;
}

export interface ElementInfoData {
  source: "scene" | "projectTree";
  expressID: number;
  fields: ElementInfoField[];
  relatedElements?: RelatedElementItem[];
}
