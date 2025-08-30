// Copied and adapted from cde-next/src/constants/truckParts.js
// Provides static truck parts, damage types, and severity levels for the API.

const TRUCK_SECTIONS = {
  'Front of Truck': 'Front of Truck',
  'Cab/Driver Area': 'Cab/Driver Area',
  'Driver Side': 'Driver Side',
  'Passenger Side': 'Passenger Side',
  'Rear of Truck': 'Rear of Truck',
  'Top/Roof': 'Top/Roof',
  'Underside/Bottom': 'Underside/Bottom'
};

const SECTION_PARTS = {
  'Front of Truck': [
    'Top Hood Panel',
    'Center Bumper',
    'LT Bumper End',
    'RT Bumper End',
    'Grille',
    'LT Headlamp',
    'RT Headlamp'
  ],
  'Cab/Driver Area': [
    'Windshield',
    'Cab Back Panel'
  ],
  'Driver Side': [
    'LT Fender',
    'LT Fender Extension',
    'LT Cowl Panel',
    'LT Step/Running Board',
    'LT Fairing',
    'LT Mid Fairing',
    'LT End Fairing',
    'LT Door',
    'LT Sleeper Panel',
    'LT Cab Extender',
    'LT Cab Ext Upper',
    'LT Side Marker/Reflector'
  ],
  'Passenger Side': [
    'RT Fender',
    'RT Fender Extension',
    'RT Cowl Panel',
    'RT Step/Running Board',
    'RT Fairing',
    'RT Mid Fairing',
    'RT End Fairing',
    'RT Door',
    'RT Sleeper Panel',
    'RT Cab Extender',
    'RT Cab Ext Upper',
    'RT Side Marker/Reflector'
  ],
  'Rear of Truck': [
    'Sleeper Back Panel',
    'Rear Bumper/ICC Bumper',
    'LT Tail Lamp',
    'RT Tail Lamp',
    'License Plate Bracket',
    'Rear Step',
    'LT Mud Flap Hanger',
    'RT Mud Flap Hanger'
  ],
  'Top/Roof': [
    'Roof Panel',
    'Sleeper Roof Panel',
    'Sun Visor',
    'Roof Air Deflector',
    'Clearance Lights',
    'Marker Lights'
  ],
  'Underside/Bottom': [
    'LT Step Bracket',
    'RT Step Bracket',
    'LT Splash Shield',
    'RT Splash Shield',
    'Underbody Fairing Panel'
  ]
};

const DAMAGE_TYPES = {
  'Dent': 'Dent',
  'Scratch': 'Scratch',
  'Scrape': 'Scrape',
  'Gouge': 'Gouge',
  'Crack': 'Crack',
  'Hole/Puncture': 'Hole/Puncture',
  'Rust': 'Rust',
  'Corrosion': 'Corrosion',
  'Paint Damage': 'Paint Damage',
  'Paint Fade': 'Paint Fade',
  'Paint Chips': 'Paint Chips',
  'Clear Coat Damage': 'Clear Coat Damage',
  'Chrome Damage': 'Chrome Damage',
  'Collision Damage': 'Collision Damage',
  'Impact Damage': 'Impact Damage',
  'Hail Damage': 'Hail Damage',
  'Weather Damage': 'Weather Damage',
  'Road Debris Damage': 'Road Debris Damage',
  'Stone Chips': 'Stone Chips',
  'Broken': 'Broken',
  'Missing': 'Missing',
  'Bent': 'Bent',
  'Twisted': 'Twisted',
  'Warped': 'Warped',
  'Wear': 'Wear',
  'Other': 'Other'
};

const SEVERITY_LEVELS = {
  'Minor': 'Minor',
  'Moderate': 'Moderate',
  'Severe': 'Severe',
  'Critical': 'Critical'
};

module.exports = {
  TRUCK_SECTIONS,
  SECTION_PARTS,
  DAMAGE_TYPES,
  SEVERITY_LEVELS
};

