// Reference ranges for common laboratory tests
// Values are in standard units unless otherwise specified
export const LAB_RANGES: Record<string, { 
  unit: string; 
  low: number; 
  high: number; 
  critical_low: number; 
  critical_high: number 
}> = {
  // Complete Blood Count (CBC)
  'Hemoglobin': { 
    unit: 'g/dL', 
    low: 12.0, 
    high: 17.0, 
    critical_low: 7.0, 
    critical_high: 20.0 
  },
  'Hematocrit': { 
    unit: '%', 
    low: 36.0, 
    high: 48.0, 
    critical_low: 20.0, 
    critical_high: 65.0 
  },
  'WBC': { 
    unit: 'cells/µL', 
    low: 4500, 
    high: 11000, 
    critical_low: 1000, 
    critical_high: 50000 
  },
  'Platelets': { 
    unit: 'cells/µL', 
    low: 150000, 
    high: 450000, 
    critical_low: 50000, 
    critical_high: 1000000 
  },
  'RBC': { 
    unit: 'million cells/µL', 
    low: 4.2, 
    high: 5.8, 
    critical_low: 2.5, 
    critical_high: 7.0 
  },
  'MCV': { 
    unit: 'fL', 
    low: 80, 
    high: 100, 
    critical_low: 60, 
    critical_high: 120 
  },
  'MCH': { 
    unit: 'pg', 
    low: 27, 
    high: 33, 
    critical_low: 20, 
    critical_high: 40 
  },
  'MCHC': { 
    unit: 'g/dL', 
    low: 32, 
    high: 36, 
    critical_low: 25, 
    critical_high: 40 
  },
  'RDW': { 
    unit: '%', 
    low: 11.5, 
    high: 14.5, 
    critical_low: 10.0, 
    critical_high: 20.0 
  },

  // Basic Metabolic Panel (BMP)
  'Glucose (Fasting)': { 
    unit: 'mg/dL', 
    low: 70, 
    high: 100, 
    critical_low: 40, 
    critical_high: 400 
  },
  'Glucose (Random)': { 
    unit: 'mg/dL', 
    low: 70, 
    high: 140, 
    critical_low: 40, 
    critical_high: 400 
  },
  'BUN': { 
    unit: 'mg/dL', 
    low: 7, 
    high: 20, 
    critical_low: 5, 
    critical_high: 100 
  },
  'Creatinine': { 
    unit: 'mg/dL', 
    low: 0.6, 
    high: 1.2, 
    critical_low: 0.2, 
    critical_high: 5.0 
  },
  'BUN/Creatinine Ratio': { 
    unit: 'ratio', 
    low: 10, 
    high: 20, 
    critical_low: 5, 
    critical_high: 30 
  },
  'Sodium': { 
    unit: 'mmol/L', 
    low: 135, 
    high: 145, 
    critical_low: 120, 
    critical_high: 160 
  },
  'Potassium': { 
    unit: 'mmol/L', 
    low: 3.5, 
    high: 5.0, 
    critical_low: 2.5, 
    critical_high: 6.5 
  },
  'Chloride': { 
    unit: 'mmol/L', 
    low: 98, 
    high: 107, 
    critical_low: 80, 
    critical_high: 115 
  },
  'CO2': { 
    unit: 'mmol/L', 
    low: 22, 
    high: 29, 
    critical_low: 15, 
    critical_high: 40 
  },
  'Calcium': { 
    unit: 'mg/dL', 
    low: 8.5, 
    high: 10.5, 
    critical_low: 7.0, 
    critical_high: 13.0 
  },

  // Liver Function Tests (LFTs)
  'Total Bilirubin': { 
    unit: 'mg/dL', 
    low: 0.1, 
    high: 1.2, 
    critical_low: 0.0, 
    critical_high: 5.0 
  },
  'Direct Bilirubin': { 
    unit: 'mg/dL', 
    low: 0.0, 
    high: 0.3, 
    critical_low: 0.0, 
    critical_high: 2.0 
  },
  'Indirect Bilirubin': { 
    unit: 'mg/dL', 
    low: 0.1, 
    high: 0.9, 
    critical_low: 0.0, 
    critical_high: 3.0 
  },
  'ALP': { 
    unit: 'U/L', 
    low: 44, 
    high: 147, 
    critical_low: 20, 
    critical_high: 500 
  },
  'ALT': { 
    unit: 'U/L', 
    low: 7, 
    high: 56, 
    critical_low: 0, 
    critical_high: 500 
  },
  'AST': { 
    unit: 'U/L', 
    low: 10, 
    high: 40, 
    critical_low: 0, 
    critical_high: 400 
  },
  'Albumin': { 
    unit: 'g/dL', 
    low: 3.5, 
    high: 5.0, 
    critical_low: 2.0, 
    critical_high: 6.0 
  },
  'Total Protein': { 
    unit: 'g/dL', 
    low: 6.0, 
    high: 8.3, 
    critical_low: 4.0, 
    critical_high: 12.0 
  },
  'GGT': { 
    unit: 'U/L', 
    low: 9, 
    high: 48, 
    critical_low: 0, 
    critical_high: 300 
  },

  // Lipid Panel
  'Total Cholesterol': { 
    unit: 'mg/dL', 
    low: 0, 
    high: 200, 
    critical_low: 0, 
    critical_high: 500 
  },
  'Triglycerides': { 
    unit: 'mg/dL', 
    low: 0, 
    high: 150, 
    critical_low: 0, 
    critical_high: 1000 
  },
  'HDL Cholesterol': { 
    unit: 'mg/dL', 
    low: 40, 
    high: 60, 
    critical_low: 0, 
    critical_high: 100 
  },
  'LDL Cholesterol': { 
    unit: 'mg/dL', 
    low: 0, 
    high: 130, 
    critical_low: 0, 
    critical_high: 400 
  },
  'VLDL Cholesterol': { 
    unit: 'mg/dL', 
    low: 0, 
    high: 30, 
    critical_low: 0, 
    critical_high: 100 
  },

  // Thyroid Function
  'TSH': { 
    unit: 'µIU/mL', 
    low: 0.4, 
    high: 4.5, 
    critical_low: 0.1, 
    critical_high: 100.0 
  },
  'Free T4': { 
    unit: 'ng/dL', 
    low: 0.9, 
    high: 1.7, 
    critical_low: 0.3, 
    critical_high: 5.0 
  },
  'Free T3': { 
    unit: 'pg/mL', 
    low: 2.3, 
    high: 4.2, 
    critical_low: 0.5, 
    critical_high: 10.0 
  },

  // Cardiac Markers
  'Troponin I': { 
    unit: 'ng/mL', 
    low: 0.0, 
    high: 0.04, 
    critical_low: 0.0, 
    critical_high: 50.0 
  },
  'Troponin T': { 
    unit: 'ng/mL', 
    low: 0.0, 
    high: 0.01, 
    critical_low: 0.0, 
    critical_high: 50.0 
  },
  'CK-MB': { 
    unit: 'ng/mL', 
    low: 0.0, 
    high: 5.0, 
    critical_low: 0.0, 
    critical_high: 50.0 
  },
  'Myoglobin': { 
    unit: 'ng/mL', 
    low: 0.0, 
    high: 85.0, 
    critical_low: 0.0, 
    critical_high: 500.0 
  },

  // Coagulation Panel
  'PT': { 
    unit: 'seconds', 
    low: 11.0, 
    high: 13.5, 
    critical_low: 5.0, 
    critical_high: 30.0 
  },
  'INR': { 
    unit: 'ratio', 
    low: 0.8, 
    high: 1.2, 
    critical_low: 0.5, 
    critical_high: 5.0 
  },
  'aPTT': { 
    unit: 'seconds', 
    low: 25.0, 
    high: 35.0, 
    critical_low: 15.0, 
    critical_high: 100.0 
  },
  'Fibrinogen': { 
    unit: 'mg/dL', 
    low: 200, 
    high: 400, 
    critical_low: 100, 
    critical_high: 800 
  },

  // Urinalysis
  'Urine pH': { 
    unit: 'pH', 
    low: 4.5, 
    high: 8.0, 
    critical_low: 4.0, 
    critical_high: 9.0 
  },
  'Urine Specific Gravity': { 
    unit: 'ratio', 
    low: 1.005, 
    high: 1.030, 
    critical_low: 1.001, 
    critical_high: 1.050 
  },

  // Additional Common Tests
  'Vitamin D (25-OH)': { 
    unit: 'ng/mL', 
    low: 20.0, 
    high: 50.0, 
    critical_low: 8.0, 
    critical_high: 150.0 
  },
  'Vitamin B12': { 
    unit: 'pg/mL', 
    low: 200, 
    high: 900, 
    critical_low: 100, 
    critical_high: 2000 
  },
  'Folate': { 
    unit: 'ng/mL', 
    low: 3.0, 
    high: 17.0, 
    critical_low: 1.0, 
    critical_high: 60.0 
  },
  'Iron': { 
    unit: 'µg/dL', 
    low: 60, 
    high: 170, 
    critical_low: 20, 
    critical_high: 400 
  },
  'Ferritin': { 
    unit: 'ng/mL', 
    low: 20, 
    high: 250, 
    critical_low: 10, 
    critical_high: 1000 
  },
  'CRP': { 
    unit: 'mg/L', 
    low: 0.0, 
    high: 3.0, 
    critical_low: 0.0, 
    critical_high: 50.0 
  },
  'ESR': { 
    unit: 'mm/hr', 
    low: 0, 
    high: 20, 
    critical_low: 0, 
    critical_high: 100 
  }
};

// Helper function to check if a test value is within normal range
export const isValueInRange = (testName: string, value: number | null): boolean => {
  if (value === null) return false;
  const range = LAB_RANGES[testName];
  if (!range) return true; // If no range defined, assume it's OK
  return value >= range.low && value <= range.high;
};

// Helper function to check if a test value is in critical range
export const isValueCritical = (testName: string, value: number | null): boolean => {
  if (value === null) return false;
  const range = LAB_RANGES[testName];
  if (!range) return false; // If no range defined, assume not critical
  return value < range.critical_low || value > range.critical_high;
};

// Helper function to get critical flag for a test value
export const getCriticalFlag = (testName: string, value: number | null): string | null => {
  if (value === null) return null;
  const range = LAB_RANGES[testName];
  if (!range) return null;
  
  if (value < range.critical_low) {
    return `${testName} LOW CRITICAL: ${value} ${range.unit} (critical low: <${range.critical_low})`;
  }
  if (value > range.critical_high) {
    return `${testName} HIGH CRITICAL: ${value} ${range.unit} (critical high: >${range.critical_high})`;
  }
  return null;
};

// Helper function to get warning flag for a test value (outside normal but not critical)
export const getWarningFlag = (testName: string, value: number | null): string | null => {
  if (value === null) return null;
  const range = LAB_RANGES[testName];
  if (!range) return null;
  
  if (value < range.low && value >= range.critical_low) {
    return `${testName} LOW: ${value} ${range.unit} (low: <${range.low})`;
  }
  if (value > range.high && value <= range.critical_high) {
    return `${testName} HIGH: ${value} ${range.unit} (high: >${range.high})`;
  }
  return null;
};