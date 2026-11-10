// Demo data for `npm run seed`. All people and companies are fictional.

export interface DemoStudent {
  email: string; name: string; role: string; education: string; institution: string; gradYear: number;
  interests: string[]; bio: string; hours: number;
  skills: Array<[string, number]>;
  projects: Array<{ title: string; description: string; repo: string; skills: string[]; months: [string, string] }>;
  evidence: Array<{ skill: string; kind: 'certificate' | 'repository' | 'project' | 'assessment'; title: string; level: number;
                    url?: string; project?: string; status: 'pending' | 'verified' | 'rejected'; note?: string }>;
}

export const STUDENTS: DemoStudent[] = [
  {
    email: 'aarav.mehta@skillgraph.dev', name: 'Aarav Mehta', role: 'Data Analyst', education: 'bachelors',
    institution: 'PES University', gradYear: 2027, hours: 10,
    interests: ['business analytics', 'dashboards', 'retail', 'storytelling with data'],
    bio: 'Final-year computer science student who enjoys turning sales and operations data into dashboards that managers actually use.',
    skills: [['Excel', 4], ['SQL', 3], ['Python', 2], ['Statistics', 2], ['Probability', 2], ['Data Visualization', 2], ['Communication', 3], ['Programming Fundamentals', 3]],
    projects: [
      { title: 'Sales performance dashboard', description: 'SQL views over a retail sales dataset feeding an Excel dashboard of regional KPIs.',
        repo: 'https://github.com/aarav-demo/sales-dashboard', skills: ['SQL', 'Excel', 'Data Visualization'], months: ['2026-03-01', '2026-05-15'] },
    ],
    evidence: [
      { skill: 'SQL', kind: 'project', title: 'Window-function queries for regional KPIs', level: 3, project: 'Sales performance dashboard', status: 'verified', note: 'Clean joins and correct use of window functions.' },
      { skill: 'Excel', kind: 'certificate', title: 'Advanced Excel certification', level: 3, url: 'https://example.org/certs/excel-advanced-aarav', status: 'verified', note: 'Certificate checked.' },
      { skill: 'Data Visualization', kind: 'repository', title: 'Dashboard design notebook', level: 3, url: 'https://github.com/aarav-demo/sales-dashboard/tree/main/charts', project: 'Sales performance dashboard', status: 'pending' },
    ],
  },
  {
    email: 'riya.nair@skillgraph.dev', name: 'Riya Nair', role: 'Backend Developer', education: 'bachelors',
    institution: 'RV College of Engineering', gradYear: 2026, hours: 12,
    interests: ['APIs', 'distributed systems', 'open source', 'fintech'],
    bio: 'Backend-focused developer who builds REST APIs with Node.js and wants to work on reliable payment systems.',
    skills: [['JavaScript', 4], ['Node.js', 3], ['SQL', 3], ['REST API Design', 3], ['Git', 3], ['Programming Fundamentals', 4], ['Data Structures & Algorithms', 2], ['TypeScript', 2], ['Computer Networks', 2]],
    projects: [
      { title: 'Campus events API', description: 'Express + PostgreSQL API for club events with JWT login and role-based access.',
        repo: 'https://github.com/riya-demo/campus-events-api', skills: ['Node.js', 'REST API Design', 'SQL', 'Authentication & Security'], months: ['2026-01-10', '2026-04-20'] },
    ],
    evidence: [
      { skill: 'REST API Design', kind: 'project', title: 'Versioned REST API with OpenAPI spec', level: 3, project: 'Campus events API', status: 'verified', note: 'Consistent resources and status codes.' },
      { skill: 'Node.js', kind: 'repository', title: 'Campus events API repository', level: 3, url: 'https://github.com/riya-demo/campus-events-api', status: 'pending' },
    ],
  },
  {
    email: 'kabir.singh@skillgraph.dev', name: 'Kabir Singh', role: 'Machine Learning Engineer', education: 'masters',
    institution: 'IIIT Bangalore', gradYear: 2026, hours: 15,
    interests: ['computer vision', 'agriculture', 'model deployment', 'LLMs'],
    bio: 'M.Tech student building image models for crop disease detection and learning how to ship them to production.',
    skills: [['Python', 4], ['Machine Learning', 3], ['Statistics', 3], ['Linear Algebra', 3], ['Pandas', 3], ['Scikit-learn', 3], ['Git', 2], ['Deep Learning', 2], ['Programming Fundamentals', 4]],
    projects: [
      { title: 'Crop disease classifier', description: 'Transfer-learning image classifier for leaf diseases with a Flask inference endpoint.',
        repo: 'https://github.com/kabir-demo/crop-disease', skills: ['Python', 'Deep Learning', 'Machine Learning'], months: ['2026-02-01', '2026-06-30'] },
    ],
    evidence: [
      { skill: 'Machine Learning', kind: 'project', title: 'Model comparison report (F1 0.91)', level: 3, project: 'Crop disease classifier', status: 'verified', note: 'Good validation design.' },
      { skill: 'Deep Learning', kind: 'repository', title: 'Fine-tuned ResNet notebook', level: 3, url: 'https://github.com/kabir-demo/crop-disease/blob/main/train.ipynb', status: 'pending' },
    ],
  },
  {
    email: 'ananya.rao@skillgraph.dev', name: 'Ananya Rao', role: 'Frontend Developer', education: 'bachelors',
    institution: 'Manipal Institute of Technology', gradYear: 2027, hours: 8,
    interests: ['design systems', 'accessibility', 'animation', 'edtech'],
    bio: 'Frontend developer who cares about accessible, well-designed interfaces for learning products.',
    skills: [['HTML & CSS', 4], ['JavaScript', 3], ['React', 3], ['Git', 3], ['UI/UX Design', 2], ['Programming Fundamentals', 3]],
    projects: [
      { title: 'Accessible quiz app', description: 'React quiz app with keyboard navigation and screen-reader labels.',
        repo: 'https://github.com/ananya-demo/a11y-quiz', skills: ['React', 'HTML & CSS', 'Accessibility'], months: ['2026-05-01', '2026-07-10'] },
    ],
    evidence: [
      { skill: 'React', kind: 'repository', title: 'Quiz app repository', level: 3, url: 'https://github.com/ananya-demo/a11y-quiz', project: 'Accessible quiz app', status: 'verified', note: 'Well-structured components.' },
      { skill: 'Accessibility', kind: 'assessment', title: 'WCAG audit of the quiz app', level: 2, url: 'https://example.org/audits/a11y-quiz', status: 'pending' },
    ],
  },
  {
    email: 'dev.patel@skillgraph.dev', name: 'Dev Patel', role: 'Data Engineer', education: 'bachelors',
    institution: 'Nirma University', gradYear: 2026, hours: 10,
    interests: ['data pipelines', 'cloud', 'logistics', 'open data'],
    bio: 'Enjoys modelling data and building pipelines; wants to own the data platform at a logistics company.',
    skills: [['SQL', 4], ['Python', 3], ['Database Design', 3], ['PostgreSQL', 3], ['ETL Pipelines', 2], ['Git', 3], ['Linux Command Line', 2], ['Programming Fundamentals', 3]],
    projects: [
      { title: 'Bus GTFS warehouse', description: 'Nightly ETL of public transit GTFS feeds into a PostgreSQL star schema.',
        repo: 'https://github.com/dev-demo/gtfs-warehouse', skills: ['ETL Pipelines', 'PostgreSQL', 'Python', 'Database Design'], months: ['2026-03-01', '2026-06-01'] },
    ],
    evidence: [
      { skill: 'Database Design', kind: 'project', title: 'Star schema for transit data', level: 3, project: 'Bus GTFS warehouse', status: 'verified', note: 'Sound normalisation decisions.' },
      { skill: 'ETL Pipelines', kind: 'repository', title: 'Pipeline code with retries', level: 3, url: 'https://github.com/dev-demo/gtfs-warehouse', status: 'rejected', note: 'No scheduling or idempotency yet; resubmit after adding them.' },
    ],
  },
  {
    email: 'sneha.kulkarni@skillgraph.dev', name: 'Sneha Kulkarni', role: 'DevOps Engineer', education: 'bachelors',
    institution: 'COEP Technological University', gradYear: 2026, hours: 9,
    interests: ['automation', 'cloud infrastructure', 'reliability'],
    bio: 'Automates everything she touches; running a homelab with Docker and learning Kubernetes.',
    skills: [['Linux Command Line', 3], ['Docker', 3], ['Git', 4], ['CI/CD', 2], ['AWS', 2], ['Computer Networks', 3], ['Python', 2], ['Operating Systems', 3]],
    projects: [
      { title: 'Homelab GitOps', description: 'Docker Compose services deployed by a GitHub Actions pipeline with health checks.',
        repo: 'https://github.com/sneha-demo/homelab-gitops', skills: ['Docker', 'CI/CD', 'Linux Command Line'], months: ['2026-04-01', '2026-08-01'] },
    ],
    evidence: [
      { skill: 'Docker', kind: 'project', title: 'Multi-service compose stack', level: 3, project: 'Homelab GitOps', status: 'verified', note: 'Good use of health checks.' },
    ],
  },
  {
    email: 'arjun.das@skillgraph.dev', name: 'Arjun Das', role: 'Data Scientist', education: 'bachelors',
    institution: 'Jadavpur University', gradYear: 2027, hours: 6,
    interests: ['healthcare', 'statistics', 'experimentation'],
    bio: 'Statistics minor interested in using experiments and models to improve patient outcomes.',
    skills: [['Python', 3], ['Statistics', 3], ['Pandas', 3], ['Machine Learning', 2], ['SQL', 2], ['Probability', 3]],
    projects: [],
    evidence: [],
  },
];

export interface DemoJob {
  title: string; company: string; location: string; workMode: 'onsite' | 'remote' | 'hybrid'; role: string;
  required: string[]; optional: string[]; salary: [number, number]; daysAgo: number; blurb: string;
}

const C = ['Northwind Analytics', 'Kestrel Labs', 'Bluefin Retail', 'Orbit Fintech', 'Tessellate Health', 'Monsoon Logistics',
  'Quanta EdTech', 'Sahyadri Systems', 'Coral Commerce', 'Lumen Mobility', 'Peregrine Cloud', 'Indigo Insurance'];

export const JOBS: DemoJob[] = [
  // Data Analyst
  { title: 'Junior Data Analyst', company: C[0], location: 'Bengaluru', workMode: 'hybrid', role: 'Data Analyst', required: ['SQL', 'Excel', 'Data Visualization', 'Statistics'], optional: ['Power BI', 'Python'], salary: [5, 8], daysAgo: 6, blurb: 'Build weekly KPI dashboards for retail clients and answer ad-hoc questions with SQL.' },
  { title: 'Business Intelligence Analyst', company: C[2], location: 'Mumbai', workMode: 'onsite', role: 'Data Analyst', required: ['SQL', 'Power BI', 'Data Visualization', 'Data Cleaning'], optional: ['Excel', 'Communication'], salary: [6, 10], daysAgo: 12, blurb: 'Own the Power BI layer for store operations and merchandising teams.' },
  { title: 'Product Analyst', company: C[3], location: 'Bengaluru', workMode: 'hybrid', role: 'Data Analyst', required: ['SQL', 'Python', 'A/B Testing', 'Statistics'], optional: ['Tableau', 'Pandas'], salary: [8, 13], daysAgo: 20, blurb: 'Measure feature adoption, run experiments and present findings to product managers.' },
  { title: 'Data Analyst, Healthcare Operations', company: C[4], location: 'Hyderabad', workMode: 'onsite', role: 'Data Analyst', required: ['SQL', 'Excel', 'Data Cleaning', 'Communication'], optional: ['Tableau', 'Statistics'], salary: [5, 7], daysAgo: 35, blurb: 'Clean hospital operations data and report bed occupancy and wait times.' },
  { title: 'Analytics Associate', company: C[8], location: 'Remote', workMode: 'remote', role: 'Data Analyst', required: ['SQL', 'Tableau', 'Data Visualization'], optional: ['Python', 'Pandas', 'Excel'], salary: [6, 9], daysAgo: 48, blurb: 'Build customer cohort dashboards for an online marketplace.' },
  { title: 'Supply Chain Data Analyst', company: C[5], location: 'Pune', workMode: 'hybrid', role: 'Data Analyst', required: ['Excel', 'SQL', 'Python', 'Data Visualization'], optional: ['Power BI'], salary: [6, 9], daysAgo: 110, blurb: 'Analyse delivery times and route efficiency across warehouses.' },
  // Data Scientist
  { title: 'Data Scientist I', company: C[1], location: 'Bengaluru', workMode: 'hybrid', role: 'Data Scientist', required: ['Python', 'Machine Learning', 'Statistics', 'Scikit-learn', 'SQL'], optional: ['Deep Learning', 'A/B Testing'], salary: [12, 18], daysAgo: 9, blurb: 'Build churn and propensity models and explain them to business teams.' },
  { title: 'Associate Data Scientist, Risk', company: C[11], location: 'Gurugram', workMode: 'onsite', role: 'Data Scientist', required: ['Python', 'Statistics', 'Machine Learning', 'Feature Engineering', 'Model Evaluation'], optional: ['SQL'], salary: [10, 15], daysAgo: 25, blurb: 'Develop claim-fraud models with careful validation and monitoring.' },
  { title: 'Data Scientist, Clinical Insights', company: C[4], location: 'Chennai', workMode: 'hybrid', role: 'Data Scientist', required: ['Python', 'Statistics', 'Pandas', 'Machine Learning', 'Communication'], optional: ['Deep Learning', 'Data Visualization'], salary: [11, 16], daysAgo: 40, blurb: 'Model patient readmission risk and present results to clinicians.' },
  { title: 'Experimentation Scientist', company: C[3], location: 'Remote', workMode: 'remote', role: 'Data Scientist', required: ['Statistics', 'A/B Testing', 'Python', 'SQL'], optional: ['Machine Learning', 'Pandas'], salary: [14, 20], daysAgo: 70, blurb: 'Design and analyse pricing and onboarding experiments.' },
  // ML Engineer
  { title: 'Machine Learning Engineer', company: C[1], location: 'Bengaluru', workMode: 'onsite', role: 'Machine Learning Engineer', required: ['Python', 'PyTorch', 'Deep Learning', 'MLOps', 'Docker'], optional: ['Kubernetes', 'AWS'], salary: [16, 26], daysAgo: 5, blurb: 'Train and serve vision models with reproducible pipelines.' },
  { title: 'LLM Applications Engineer', company: C[6], location: 'Remote', workMode: 'remote', role: 'Machine Learning Engineer', required: ['Python', 'LLM Applications', 'Vector Databases', 'REST API Design'], optional: ['NLP', 'Docker'], salary: [15, 24], daysAgo: 14, blurb: 'Build retrieval-augmented tutoring assistants over course content.' },
  { title: 'ML Platform Engineer', company: C[10], location: 'Hyderabad', workMode: 'hybrid', role: 'Machine Learning Engineer', required: ['Python', 'MLOps', 'Docker', 'Kubernetes', 'CI/CD'], optional: ['AWS', 'Monitoring & Observability'], salary: [18, 28], daysAgo: 30, blurb: 'Run the model training and deployment platform used by data science teams.' },
  { title: 'Applied ML Engineer, Agritech', company: C[7], location: 'Pune', workMode: 'onsite', role: 'Machine Learning Engineer', required: ['Python', 'Machine Learning', 'Deep Learning', 'Git'], optional: ['PyTorch', 'MLOps'], salary: [12, 18], daysAgo: 55, blurb: 'Deploy crop and soil models to field devices.' },
  { title: 'NLP Engineer', company: C[11], location: 'Gurugram', workMode: 'hybrid', role: 'Machine Learning Engineer', required: ['Python', 'NLP', 'Deep Learning', 'PyTorch'], optional: ['LLM Applications'], salary: [15, 22], daysAgo: 95, blurb: 'Extract entities from insurance documents.' },
  // Data Engineer
  { title: 'Data Engineer', company: C[5], location: 'Pune', workMode: 'hybrid', role: 'Data Engineer', required: ['SQL', 'Python', 'ETL Pipelines', 'Airflow', 'Database Design'], optional: ['AWS', 'Docker'], salary: [10, 16], daysAgo: 7, blurb: 'Own the shipment-event pipelines that feed operations dashboards.' },
  { title: 'Junior Data Engineer', company: C[0], location: 'Bengaluru', workMode: 'onsite', role: 'Data Engineer', required: ['SQL', 'Python', 'ETL Pipelines', 'PostgreSQL'], optional: ['Apache Spark', 'Git'], salary: [8, 12], daysAgo: 18, blurb: 'Build and test ELT jobs into the analytics warehouse.' },
  { title: 'Big Data Engineer', company: C[9], location: 'Chennai', workMode: 'onsite', role: 'Data Engineer', required: ['Apache Spark', 'Python', 'SQL', 'ETL Pipelines'], optional: ['Airflow', 'AWS'], salary: [12, 20], daysAgo: 45, blurb: 'Process vehicle telemetry at scale with Spark.' },
  { title: 'Analytics Engineer', company: C[8], location: 'Remote', workMode: 'remote', role: 'Data Engineer', required: ['SQL', 'Database Design', 'Data Cleaning', 'Git'], optional: ['Python', 'Airflow'], salary: [10, 15], daysAgo: 100, blurb: 'Model marketplace data into clean, tested tables.' },
  // Backend
  { title: 'Backend Developer (Node.js)', company: C[3], location: 'Bengaluru', workMode: 'hybrid', role: 'Backend Developer', required: ['Node.js', 'REST API Design', 'SQL', 'PostgreSQL', 'Authentication & Security'], optional: ['TypeScript', 'Redis', 'Docker'], salary: [9, 15], daysAgo: 4, blurb: 'Build payment and ledger APIs with strong consistency guarantees.' },
  { title: 'Software Engineer, APIs', company: C[6], location: 'Remote', workMode: 'remote', role: 'Backend Developer', required: ['Node.js', 'TypeScript', 'REST API Design', 'Testing'], optional: ['GraphQL', 'MongoDB'], salary: [10, 16], daysAgo: 16, blurb: 'Ship well-tested APIs for the learning platform.' },
  { title: 'Java Backend Engineer', company: C[11], location: 'Gurugram', workMode: 'onsite', role: 'Backend Developer', required: ['Java', 'Spring Boot', 'SQL', 'REST API Design'], optional: ['Docker', 'System Design'], salary: [8, 14], daysAgo: 28, blurb: 'Maintain policy and claims services.' },
  { title: 'Backend Engineer, Logistics', company: C[5], location: 'Pune', workMode: 'hybrid', role: 'Backend Developer', required: ['Node.js', 'PostgreSQL', 'Database Design', 'Docker', 'Git'], optional: ['Redis', 'System Design'], salary: [9, 14], daysAgo: 60, blurb: 'Build route-planning and tracking services.' },
  { title: 'Platform Backend Developer', company: C[10], location: 'Hyderabad', workMode: 'onsite', role: 'Backend Developer', required: ['Go', 'REST API Design', 'SQL', 'Docker'], optional: ['Kubernetes', 'Redis'], salary: [12, 18], daysAgo: 120, blurb: 'Build internal APIs for the cloud console.' },
  // Frontend
  { title: 'Frontend Developer (React)', company: C[6], location: 'Bengaluru', workMode: 'hybrid', role: 'Frontend Developer', required: ['React', 'JavaScript', 'TypeScript', 'HTML & CSS'], optional: ['Next.js', 'Testing', 'Accessibility'], salary: [8, 13], daysAgo: 3, blurb: 'Build accessible course and assessment interfaces.' },
  { title: 'UI Engineer', company: C[8], location: 'Remote', workMode: 'remote', role: 'Frontend Developer', required: ['HTML & CSS', 'JavaScript', 'React', 'UI/UX Design'], optional: ['Accessibility'], salary: [7, 11], daysAgo: 22, blurb: 'Own the design system used across the storefront.' },
  { title: 'Next.js Developer', company: C[2], location: 'Mumbai', workMode: 'onsite', role: 'Frontend Developer', required: ['Next.js', 'React', 'TypeScript'], optional: ['REST API Design', 'Testing'], salary: [9, 14], daysAgo: 38, blurb: 'Build fast, server-rendered product pages.' },
  { title: 'Frontend Engineer, Accessibility', company: C[4], location: 'Chennai', workMode: 'hybrid', role: 'Frontend Developer', required: ['HTML & CSS', 'Accessibility', 'JavaScript', 'React'], optional: ['Testing'], salary: [8, 12], daysAgo: 75, blurb: 'Make patient portals usable for everyone.' },
  // Full-stack
  { title: 'Full-Stack Developer', company: C[7], location: 'Pune', workMode: 'hybrid', role: 'Full-Stack Developer', required: ['JavaScript', 'React', 'Node.js', 'SQL', 'REST API Design'], optional: ['Next.js', 'Docker'], salary: [8, 14], daysAgo: 10, blurb: 'Deliver features end to end for farm-management software.' },
  { title: 'Full-Stack Engineer (Next.js)', company: C[3], location: 'Bengaluru', workMode: 'onsite', role: 'Full-Stack Developer', required: ['Next.js', 'TypeScript', 'PostgreSQL', 'Authentication & Security'], optional: ['MongoDB', 'Testing'], salary: [12, 18], daysAgo: 26, blurb: 'Build customer onboarding flows across UI and API.' },
  { title: 'Software Developer, EdTech', company: C[6], location: 'Remote', workMode: 'remote', role: 'Full-Stack Developer', required: ['React', 'Node.js', 'MongoDB', 'Git'], optional: ['TypeScript', 'Docker'], salary: [7, 12], daysAgo: 65, blurb: 'Build classroom tools for teachers.' },
  // DevOps
  { title: 'DevOps Engineer', company: C[10], location: 'Hyderabad', workMode: 'hybrid', role: 'DevOps Engineer', required: ['Linux Command Line', 'Docker', 'Kubernetes', 'CI/CD', 'AWS'], optional: ['Terraform', 'Monitoring & Observability'], salary: [10, 17], daysAgo: 8, blurb: 'Run Kubernetes clusters and the CI/CD platform.' },
  { title: 'Site Reliability Engineer', company: C[9], location: 'Chennai', workMode: 'onsite', role: 'DevOps Engineer', required: ['Linux Command Line', 'Monitoring & Observability', 'Kubernetes', 'Python'], optional: ['Go', 'Terraform'], salary: [12, 20], daysAgo: 21, blurb: 'Keep the telemetry platform fast and available.' },
  { title: 'Cloud Engineer', company: C[11], location: 'Gurugram', workMode: 'hybrid', role: 'DevOps Engineer', required: ['AWS', 'Terraform', 'Linux Command Line', 'Computer Networks'], optional: ['Docker', 'CI/CD'], salary: [10, 16], daysAgo: 50, blurb: 'Provision and secure AWS accounts with Terraform.' },
  { title: 'Build & Release Engineer', company: C[1], location: 'Bengaluru', workMode: 'onsite', role: 'DevOps Engineer', required: ['CI/CD', 'Git', 'Docker', 'Linux Command Line'], optional: ['Python'], salary: [8, 13], daysAgo: 130, blurb: 'Speed up build pipelines for model and app releases.' },
];

export function jobDescription(j: DemoJob) {
  return `${j.company} is hiring a ${j.title} in ${j.location} (${j.workMode}). ${j.blurb} ` +
    `You will work with ${j.required.slice(0, -1).join(', ')} and ${j.required.at(-1)} every day` +
    (j.optional.length ? `; experience with ${j.optional.join(', ')} is a plus.` : '.') +
    ` We value clear communication, ownership and a habit of learning in public.`;
}

export const SAMPLE_RESUME = `AARAV MEHTA
Bengaluru | aarav.mehta@skillgraph.dev | github.com/aarav-demo | linkedin.com/in/aarav-demo

SUMMARY
Final-year B.Tech student who turns sales and operations data into dashboards and clear recommendations.

EDUCATION
B.Tech in Computer Science, PES University, Bengaluru - 2027 (CGPA 8.4)
Class XII (CBSE), Delhi Public School - 2023

EXPERIENCE
Data Analytics Intern - Bluefin Retail (May 2026 - Jul 2026)
- Wrote SQL queries with window functions to track weekly store KPIs
- Automated a weekly Excel report with pivot tables, saving 4 hours a week
- Presented findings to regional managers; built charts in Power BI

PROJECTS
Sales Performance Dashboard | SQL, Excel
- Designed SQL views over 2 years of retail sales and an Excel dashboard of regional KPIs
Customer Segmentation Notebook | Python, Pandas
- Cleaned 50k customer records with pandas and grouped them with k-means clustering

TECHNICAL SKILLS
Languages: Python, SQL
Tools: Excel, Power BI, Tableau, Jupyter, Looker Studio
Libraries: Pandas, NumPy, Matplotlib
Other: Statistics, data cleaning, storytelling, stakeholder management, Alteryx

CERTIFICATIONS
Advanced Excel - certification (2025)
`;
