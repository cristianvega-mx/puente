// Sample data for the demo family. Every name, address and email is fictional;
// email domains use the reserved example.org / example.com zones.

export type Child = {
  id: string;
  name: string;
  grade: string;
  school: string;
  teacher: { name: string; email: string };
};

export type Notice = {
  id: string;
  childId: string;
  from: string;
  receivedAt: string;
  subject: string;
  body: string;
  language: 'en';
  read: boolean;
};

export const family = {
  familyName: 'Hernández',
  parentName: 'María Hernández',
  city: 'Houston, TX',
  parentLanguage: 'es',
  children: [
    {
      id: 'sofia',
      name: 'Sofía',
      grade: '3rd grade',
      school: 'Lincoln Elementary School',
      teacher: { name: 'Ms. Karen Johnson', email: 'kjohnson@lincoln-es.example.org' }
    },
    {
      id: 'mateo',
      name: 'Mateo',
      grade: '7th grade',
      school: 'Roosevelt Middle School',
      teacher: { name: 'Mr. David Park', email: 'dpark@roosevelt-ms.example.org' }
    }
  ] satisfies Child[]
};

export const notices: Notice[] = [
  {
    id: 'n-001',
    childId: 'sofia',
    from: 'Lincoln Elementary Front Office',
    receivedAt: '2026-09-21T08:12:00-05:00',
    subject: 'Picture Day is Thursday, October 8!',
    body:
      "Dear Families, Lincoln Elementary's Fall Picture Day is Thursday, October 8. " +
      'Pre-order packages online at portraits.example.com with Picture Day ID LNC2026F by Tuesday, October 6. ' +
      'Packages range from $18 to $42. Retakes will be held on Thursday, November 5. ' +
      'Questions? Contact the front office at (713) 555-0142.',
    language: 'en',
    read: false
  },
  {
    id: 'n-002',
    childId: 'sofia',
    from: 'Ms. Karen Johnson, 3rd Grade',
    receivedAt: '2026-09-22T15:40:00-05:00',
    subject: 'Field Trip Permission Slip: Museum of Natural Science',
    body:
      'Our 3rd grade classes will visit the Museum of Natural Science on Thursday, October 15, ' +
      'departing at 8:45 AM and returning by 2:30 PM. The cost is $12 per student, payable in cash ' +
      'or through the SchoolPay portal. Please sign and return the attached permission slip by Friday, October 9. ' +
      'Students without a signed slip will remain at school. We are also looking for 4 parent chaperones; ' +
      'reply to this message if you are interested. Students should bring a sack lunch.',
    language: 'en',
    read: false
  },
  {
    id: 'n-003',
    childId: 'mateo',
    from: 'Roosevelt Middle School',
    receivedAt: '2026-09-23T10:05:00-05:00',
    subject: 'Parent-Teacher Conferences: Sign Up Now',
    body:
      'Roosevelt Middle School will hold Parent-Teacher Conferences on Tuesday, October 20 and Wednesday, October 21, ' +
      'from 3:30 PM to 7:00 PM. Conferences are 15 minutes long and can be held in person or by video call. ' +
      'Please sign up for a time slot through the ParentConnect app by Friday, October 16. ' +
      'Interpreters are available at no cost; please request one when you sign up.',
    language: 'en',
    read: false
  },
  {
    id: 'n-004',
    childId: 'mateo',
    from: 'Roosevelt Middle School',
    receivedAt: '2026-09-24T16:30:00-05:00',
    subject: 'Early Release Day: Friday, October 9',
    body:
      'Reminder: Friday, October 9 is an Early Release Day for staff professional development. ' +
      'Students will be dismissed at 12:30 PM. Buses will run on the early schedule. ' +
      'After-school programs will not be held that day.',
    language: 'en',
    read: false
  },
  {
    id: 'n-005',
    childId: 'sofia',
    from: 'Lincoln Elementary Food Services',
    receivedAt: '2026-09-25T07:00:00-05:00',
    subject: 'Low Lunch Account Balance',
    body:
      "This is an automated message from Lincoln Elementary Food Services. Sofía Hernández's lunch account balance is $2.15. " +
      'A student lunch costs $3.25. Please add funds through the SchoolPay portal or send cash or a check to the cafeteria. ' +
      'Families may also apply for free or reduced-price meals at any time during the school year.',
    language: 'en',
    read: false
  },
  {
    id: 'n-006',
    childId: 'mateo',
    from: 'Roosevelt Middle School Nurse',
    receivedAt: '2026-09-25T11:20:00-05:00',
    subject: 'Required: Updated Immunization Record for 7th Grade',
    body:
      'Texas requires all students entering 7th grade to have received the Tdap booster and the meningococcal (MCV4) vaccine. ' +
      "Our records show we have not received Mateo's updated immunization record. " +
      'Please submit it to the school nurse by Friday, October 30. ' +
      'Students without records on file may be excluded from school until the record is received. ' +
      'Free vaccines are available at county public health clinics.',
    language: 'en',
    read: false
  }
];

export function childById(id: string): Child | undefined {
  return family.children.find(child => child.id === id);
}

// Accepts an id ("sofia") or a spoken name ("Sofía", "sofia", "Mateo").
export function resolveChild(nameOrId: string): Child | undefined {
  const key = nameOrId
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  return family.children.find(
    child =>
      child.id === key ||
      child.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase() === key
  );
}
