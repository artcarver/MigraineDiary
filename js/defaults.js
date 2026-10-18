// Lists the app starts with. Medicines and symptoms are copied into the saved
// data on first run and edited from Settings after that.

// Overuse limits are the ICHD-3 medication-overuse thresholds, in days per
// month: 10 for triptans and combination or opioid medicines, 15 for simple
// pain relievers, and 10 in total when more than one of these classes is used.
export const MED_KINDS = {
  triptan: { label: 'Triptan', hint: 'Sumatriptan, rizatriptan, and similar', overuseLimit: 10 },
  simple: { label: 'Pain reliever', hint: 'Ibuprofen, naproxen, acetaminophen, aspirin', overuseLimit: 15 },
  combo: { label: 'Combination pain reliever', hint: 'Excedrin, Fioricet, and pain relievers combined with codeine', overuseLimit: 10 },
  gepant: { label: 'Gepant or ditan', hint: 'Ubrelvy, Nurtec, Reyvow' },
  allergy: { label: 'Allergy or sinus', hint: 'Zyrtec, Claritin, Allegra, Flonase, Sudafed' },
  other: { label: 'Other', hint: 'Anti-nausea and anything else' },
  preventive: { label: 'Daily preventive or supplement', hint: 'Taken every day to prevent migraines, like magnesium', daily: true },
};

export const COMBINED_LIMIT = 10;

// The owner's own medicines and usual doses.
export const DEFAULT_MEDS = [
  { name: 'Rizatriptan', dose: '10 mg', brand: 'Maxalt tablet', kind: 'triptan' },
  { name: 'Ibuprofen', dose: '400 mg', brand: 'Advil or Motrin, 2 pills', kind: 'simple' },
  { name: 'Naproxen', dose: '440 mg', brand: 'Aleve, 2 pills', kind: 'simple' },
  { name: 'Acetaminophen', dose: '1000 mg', brand: 'Tylenol Extra Strength, 2 pills', kind: 'simple' },
  { name: 'Excedrin Migraine', dose: '2 caplets', brand: 'Acetaminophen, aspirin and caffeine', kind: 'combo' },
  { name: 'Cetirizine', dose: '10 mg', brand: 'Zyrtec', kind: 'allergy' },
  { name: 'Diphenhydramine', dose: '12.5 mg', brand: 'Benadryl', kind: 'allergy' },
  { name: 'Pseudoephedrine', dose: '120 mg', brand: 'Sudafed 12 Hour', kind: 'allergy' },
  { name: 'Fluticasone spray', dose: '', brand: 'Flonase', kind: 'allergy' },
  { name: 'Magnesium', dose: '400 mg', brand: 'Daily supplement', kind: 'preventive' },
  { name: 'Riboflavin', dose: '400 mg', brand: 'Vitamin B2, daily supplement', kind: 'preventive' },
];

// The generic starting list from the first version, as name and dose, so a
// phone that saved it can be moved to the list above.
export const V1_DEFAULT_MEDS = [
  ['Ibuprofen', '200 mg'],
  ['Naproxen', '220 mg'],
  ['Acetaminophen', '500 mg'],
  ['Excedrin Migraine', ''],
  ['Sumatriptan', '50 mg'],
  ['Rizatriptan', '10 mg'],
  ['Cetirizine', '10 mg'],
  ['Loratadine', '10 mg'],
  ['Fexofenadine', '180 mg'],
  ['Fluticasone spray', ''],
];

export const DEFAULT_SYMPTOMS = [
  { id: 'light', label: 'Light bothers me' },
  { id: 'sound', label: 'Noise bothers me' },
  { id: 'smell', label: 'Smells bother me' },
  { id: 'nausea', label: 'Nausea' },
  { id: 'vomit', label: 'Vomiting' },
  { id: 'movement', label: 'Worse with movement' },
  { id: 'stuffy', label: 'Stuffy nose' },
  { id: 'runny', label: 'Runny nose' },
  { id: 'facepressure', label: 'Face pressure' },
  { id: 'watery', label: 'Watery eyes' },
];

export const QUALITIES = [
  { id: 'throbbing', label: 'Throbbing' },
  { id: 'pressure', label: 'Pressure or squeezing' },
  { id: 'stabbing', label: 'Stabbing' },
  { id: 'dull', label: 'Dull ache' },
];

// side is the person's own side: L, R, or M for the middle.
export const LOCATIONS = [
  { id: 'fh-l', label: 'Forehead, left', side: 'L' },
  { id: 'fh-c', label: 'Forehead, middle', side: 'M' },
  { id: 'fh-r', label: 'Forehead, right', side: 'R' },
  { id: 'tm-l', label: 'Left temple', side: 'L' },
  { id: 'tm-r', label: 'Right temple', side: 'R' },
  { id: 'ey-l', label: 'Behind left eye', side: 'L' },
  { id: 'ey-r', label: 'Behind right eye', side: 'R' },
  { id: 'br', label: 'Bridge of nose', side: 'M' },
  { id: 'ck-l', label: 'Left cheek or sinus', side: 'L' },
  { id: 'ck-r', label: 'Right cheek or sinus', side: 'R' },
  { id: 'top', label: 'Top of head', side: 'M' },
  { id: 'back', label: 'Back of head or neck', side: 'M' },
];

export const WARNING_SIGNS = [
  { id: 'tired', label: 'Tired' },
  { id: 'focus', label: 'Hard to concentrate' },
  { id: 'neck', label: 'Stiff neck' },
  { id: 'yawn', label: 'Yawning' },
  { id: 'mood', label: 'Mood change' },
  { id: 'crave', label: 'Food cravings' },
];

export const AURA_TYPES = [
  { id: 'vision', label: 'Vision changes' },
  { id: 'tingle', label: 'Tingling or numbness' },
  { id: 'speech', label: 'Trouble finding words' },
];

export const AURA_LENGTHS = [
  { id: 'short', label: 'Under 5 min' },
  { id: 'mid', label: '5 to 60 min' },
  { id: 'long', label: 'Over an hour' },
];

// How the day went, on the traffic-light scale used by Migraine Canada and
// the Mayo Clinic stoplight diary.
export const LEVELS = [
  { id: 0, label: 'No migraine', short: 'None' },
  { id: 1, label: 'Could function', short: 'Could function' },
  { id: 2, label: 'Slowed down', short: 'Slowed down' },
  { id: 3, label: 'Had to stop or in bed', short: 'Had to stop' },
];

export const RESULTS = [
  { id: 'gone', label: 'Gone' },
  { id: 'better', label: 'Better' },
  { id: 'same', label: 'Same or worse' },
];

export const HABITS = [
  {
    id: 'sleep',
    label: 'Sleep last night',
    options: [
      { id: 'poor', label: 'Poor' },
      { id: 'ok', label: 'Okay' },
      { id: 'good', label: 'Good' },
    ],
  },
  {
    id: 'meals',
    label: 'Meals',
    options: [
      { id: 'regular', label: 'Regular' },
      { id: 'skipped', label: 'Skipped one' },
    ],
  },
  {
    id: 'caffeine',
    label: 'Caffeine',
    options: [
      { id: 'usual', label: 'Usual' },
      { id: 'more', label: 'More' },
      { id: 'less', label: 'Less' },
    ],
  },
];

export const MIDAS_QUESTIONS = [
  'On how many days in the last 3 months did you miss work or school because of your headaches?',
  'How many days in the last 3 months was your productivity at work or school reduced by half or more because of your headaches? Do not include days you counted in question 1.',
  'On how many days in the last 3 months did you not do household work because of your headaches?',
  'How many days in the last 3 months was your productivity in household work reduced by half or more because of your headaches? Do not include days you counted in question 3.',
  'On how many days in the last 3 months did you miss family, social or leisure activities because of your headaches?',
];

export const MIDAS_EXTRA = [
  'On how many days in the last 3 months did you have a headache? If a headache lasted more than 1 day, count each day.',
  'On a scale of 0 to 10, on average how painful were these headaches? 0 is no pain at all, 10 is pain as bad as it can be.',
];

export function midasGrade(score) {
  if (score <= 5) return { grade: 'I', label: 'Little or no disability' };
  if (score <= 10) return { grade: 'II', label: 'Mild disability' };
  if (score <= 20) return { grade: 'III', label: 'Moderate disability' };
  return { grade: 'IV', label: 'Severe disability' };
}
