export interface VolvoParameter {
  ParameterCode: string;
  PolicyFlags: string;
  PresentationFlags: string;
  Audiences: string;
  DataDefinition: string;
  CaptionId: string;
  DescriptionId: string;
  DefaultCaption: string;
  DefaultDescription: string;
  Controllable: string;
  ResetToDefaultSupport: string;
  AccessMode: string;
  // Computed fields
  parsedType?: string;
  parsedAudiences?: string;
  isLogging?: boolean;
  priority?: number;
}

export interface AnalysisSummary {
  totalParameters: number;
  controllableCount: number;
  types: Record<string, number>;
  audienceStats: Record<string, number>;
  accessModes: Record<string, number>;
}
