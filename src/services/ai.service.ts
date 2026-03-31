import { Mistral } from '@mistralai/mistralai';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

let mistral: Mistral | null = null;

if (MISTRAL_API_KEY) {
    mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
}

interface PatientContext {
    age?: number;
    gender?: string;
    allergies?: string[];
    chronicConditions?: string[];
    chiefComplaint?: string;
    subjective?: string;
    objective?: string;
    vitals?: {
        bpSystolic?: number;
        bpDiastolic?: number;
        heartRate?: number;
        temperature?: number;
        respiratoryRate?: number;
        oxygenSaturation?: number;
    };
    labResults?: Array<{ testName: string; value: any; unit?: string }>;
    medications?: Array<{ name: string; dosage: string; frequency: string }>;
}

interface AISuggestion {
    differentialDiagnosis: string[];
    suggestedTests: string[];
    redFlags: string[];
    treatmentNotes: string;
    confidence: 'low' | 'medium' | 'high';
}

/**
 * Get AI-powered diagnosis suggestions based on patient context
 */
export const getDiagnosisSuggestions = async (context: PatientContext): Promise<AISuggestion | null> => {
    if (!mistral) {
        return null;
    }

    try {
        const prompt = buildPrompt(context);

        const response = await mistral.chat.complete({
            model: 'mistral-small-latest',
            messages: [
                {
                    role: 'system',
                    content: `You are a clinical decision support AI assistant for a hospital management system. 
Analyze the patient data and provide structured suggestions. 
IMPORTANT: These are suggestions only - clinical judgment by the attending physician always takes precedence.
Respond in JSON format with the following structure:
{
  "differentialDiagnosis": ["diagnosis1", "diagnosis2", "diagnosis3"],
  "suggestedTests": ["test1", "test2"],
  "redFlags": ["flag1", "flag2"],
  "treatmentNotes": "Brief treatment guidance",
  "confidence": "low|medium|high"
}
Keep responses concise and clinically relevant. Limit to 3-5 items per array.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            maxTokens: 800
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content) return null;

        const textContent = typeof content === 'string' ? content : content.map(c => c.type === 'text' ? c.text : '').join('');
        if (!textContent) return null;

        try {
            const parsed = JSON.parse(textContent);
            return parsed as AISuggestion;
        } catch {
            return null;
        }
    } catch (error: any) {
        console.error('Mistral AI service error:', error.message);
        return null;
    }
};

/**
 * Get AI-suggested triage level based on vitals and chief complaint
 */
export const getTriageSuggestion = async (context: {
    chiefComplaint: string;
    vitals?: PatientContext['vitals'];
    age?: number;
    gender?: string;
}): Promise<{ suggestedLevel: number; reasoning: string } | null> => {
    if (!mistral) {
        return null;
    }

    try {
        const vitalsStr = context.vitals
            ? `Vitals: BP ${context.vitals.bpSystolic}/${context.vitals.bpDiastolic}, HR ${context.vitals.heartRate}, Temp ${context.vitals.temperature}°C, RR ${context.vitals.respiratoryRate}, SpO2 ${context.vitals.oxygenSaturation}%`
            : 'No vitals recorded';

        const response = await mistral.chat.complete({
            model: 'mistral-small-latest',
            messages: [
                {
                    role: 'system',
                    content: `You are a triage AI assistant. Based on the patient presentation, suggest a triage level (1-5) using the ESI (Emergency Severity Index):
1 = Resuscitation (immediate life-threatening)
2 = Emergent (high risk, severe pain)
3 = Urgent (multiple resources needed)
4 = Less Urgent (one resource needed)
5 = Non-Urgent (no resources needed)

Respond in JSON: { "suggestedLevel": 1-5, "reasoning": "brief explanation" }`
                },
                {
                    role: 'user',
                    content: `Patient: ${context.age}yo ${context.gender}\nChief Complaint: ${context.chiefComplaint}\n${vitalsStr}`
                }
            ],
            temperature: 0.2,
            maxTokens: 300
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content) return null;

        const textContent = typeof content === 'string' ? content : content.map(c => c.type === 'text' ? c.text : '').join('');
        if (!textContent) return null;

        return JSON.parse(textContent);
    } catch (error: any) {
        console.error('Mistral triage suggestion error:', error.message);
        return null;
    }
};

function buildPrompt(context: PatientContext): string {
    const parts: string[] = [];

    if (context.age || context.gender) {
        parts.push(`Patient: ${context.age || '?'}yo ${context.gender || 'Unknown'}`);
    }

    if (context.allergies?.length) {
        parts.push(`Allergies: ${context.allergies.join(', ')}`);
    }

    if (context.chronicConditions?.length) {
        parts.push(`Chronic Conditions: ${context.chronicConditions.join(', ')}`);
    }

    if (context.chiefComplaint) {
        parts.push(`Chief Complaint: ${context.chiefComplaint}`);
    }

    if (context.subjective) {
        parts.push(`Subjective: ${context.subjective}`);
    }

    if (context.objective) {
        parts.push(`Objective: ${context.objective}`);
    }

    if (context.vitals) {
        const v = context.vitals;
        const vitalsParts: string[] = [];
        if (v.bpSystolic && v.bpDiastolic) vitalsParts.push(`BP ${v.bpSystolic}/${v.bpDiastolic}`);
        if (v.heartRate) vitalsParts.push(`HR ${v.heartRate}`);
        if (v.temperature) vitalsParts.push(`Temp ${v.temperature}°C`);
        if (v.respiratoryRate) vitalsParts.push(`RR ${v.respiratoryRate}`);
        if (v.oxygenSaturation) vitalsParts.push(`SpO2 ${v.oxygenSaturation}%`);
        if (vitalsParts.length) parts.push(`Vitals: ${vitalsParts.join(', ')}`);
    }

    if (context.labResults?.length) {
        parts.push(`Lab Results: ${context.labResults.map(l => `${l.testName}: ${l.value} ${l.unit || ''}`).join(', ')}`);
    }

    if (context.medications?.length) {
        parts.push(`Current Medications: ${context.medications.map(m => `${m.name} ${m.dosage} ${m.frequency}`).join(', ')}`);
    }

    return parts.join('\n');
}
