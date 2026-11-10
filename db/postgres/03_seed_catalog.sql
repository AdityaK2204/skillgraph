-- =====================================================================
-- SkillGraph · 03_seed_catalog.sql
-- Reference data: skill catalogue, career roles, role requirements,
-- prerequisite graph and default scoring weights.
-- (Demo users, job postings and embeddings are added by `npm run seed`.)
-- =====================================================================

INSERT INTO scoring_weights (factor, weight, label) VALUES
  ('demand',    0.20, 'Market demand for the skill in postings for the target role'),
  ('relevance', 0.20, 'Importance of the skill for the target role'),
  ('gap',       0.20, 'Distance between required and current level'),
  ('readiness', 0.10, 'Share of prerequisites already in place'),
  ('interest',  0.10, 'Semantic fit with the user''s interests (pgvector)'),
  ('evidence',  0.10, 'How much new proof would strengthen the profile'),
  ('ease',      0.10, 'Inverse of typical learning effort');

INSERT INTO skills (name, category, effort_hours, aliases, description) VALUES
-- foundations
('Programming Fundamentals','foundation', 60,'{programming,coding,"problem solving"}','Variables, control flow, functions and basic problem decomposition in any language.'),
('Data Structures & Algorithms','foundation',150,'{dsa,"data structures",algorithms,leetcode}','Arrays, trees, graphs, hashing, sorting, searching and complexity analysis.'),
('Statistics','foundation', 80,'{"descriptive statistics","inferential statistics","hypothesis testing"}','Descriptive and inferential statistics, distributions, hypothesis tests and confidence intervals.'),
('Probability','foundation', 50,'{"probability theory"}','Random variables, conditional probability, Bayes theorem and common distributions.'),
('Linear Algebra','foundation', 60,'{matrices,vectors}','Vectors, matrices, eigenvalues and decompositions used throughout machine learning.'),
('Computer Networks','foundation', 60,'{networking,"tcp/ip",http,dns}','TCP/IP, HTTP, DNS, routing and how services talk over a network.'),
('Operating Systems','foundation', 60,'{os,processes,threads}','Processes, threads, memory management, file systems and scheduling.'),
('Git','foundation', 15,'{github,gitlab,"version control"}','Version control with branches, merges, pull requests and history.'),
('Linux Command Line','devops', 25,'{linux,bash,shell,unix}','Navigating and scripting Linux systems from the shell.'),
-- languages
('Python','language', 80,'{python3,py}','General-purpose language used for data work, automation, ML and back ends.'),
('JavaScript','language', 80,'{js,es6,ecmascript}','The language of the web, used in browsers and on servers with Node.js.'),
('TypeScript','language', 40,'{ts}','Typed superset of JavaScript for large, maintainable codebases.'),
('Java','language',100,'{jdk,j2ee}','Statically typed, object-oriented language common in enterprise back ends.'),
('Go','language', 80,'{golang}','Compiled language designed for simple, concurrent network services.'),
('C++','language',120,'{cpp,"c plus plus"}','Systems language offering low-level control and high performance.'),
-- frontend
('HTML & CSS','frontend', 40,'{html,css,html5,css3,"responsive design",tailwind}','Semantic markup, layout, styling and responsive design for the web.'),
('React','frontend', 80,'{reactjs,"react.js",hooks}','Component-based library for building interactive user interfaces.'),
('Next.js','frontend', 50,'{nextjs,"next js"}','React framework with routing, server rendering and API routes.'),
('Accessibility','frontend', 25,'{a11y,wcag,aria}','Building interfaces usable by everyone, following WCAG guidelines.'),
('UI/UX Design','frontend', 40,'{figma,"ui design","ux design",wireframing}','Designing usable interfaces: user flows, wireframes and visual hierarchy.'),
-- backend
('Node.js','backend', 50,'{nodejs,node,express,expressjs}','JavaScript runtime for building servers, APIs and tooling.'),
('REST API Design','backend', 30,'{rest,"rest api",restful,api}','Designing resource-oriented HTTP APIs with proper status codes and versioning.'),
('GraphQL','backend', 30,'{apollo}','Query language and runtime for flexible client-driven APIs.'),
('Spring Boot','backend', 80,'{spring,"spring framework"}','Java framework for production-ready web services.'),
('Authentication & Security','backend', 40,'{auth,jwt,oauth,owasp,"web security"}','Password hashing, sessions, JWT, OAuth and the OWASP top risks.'),
('System Design','backend',120,'{"distributed systems",scalability,"high level design"}','Designing scalable systems: caching, queues, sharding and trade-offs.'),
('Testing','backend', 30,'{jest,pytest,"unit testing","integration testing",tdd}','Unit, integration and end-to-end testing practices.'),
-- databases
('SQL','database', 60,'{mysql,"sql queries",joins}','Querying relational data with joins, aggregation, subqueries and window functions.'),
('PostgreSQL','database', 50,'{postgres,psql,plpgsql}','Advanced open-source relational database: indexes, functions, triggers, extensions.'),
('Database Design','database', 40,'{"data modeling","er diagram",normalization,"schema design"}','ER modelling, normalisation, keys and constraints.'),
('MongoDB','database', 30,'{mongo,nosql,mongoose}','Document database with flexible schemas and aggregation pipelines.'),
('Graph Databases','database', 30,'{neo4j,cypher,"graph database"}','Modelling and traversing connected data with Neo4j and Cypher.'),
('Redis','database', 20,'{caching,"in-memory store"}','In-memory data store used for caching, queues and sessions.'),
('Vector Databases','database', 20,'{pgvector,pinecone,qdrant,chroma,embeddings,"semantic search"}','Storing embeddings and running similarity search.'),
-- data
('Excel','data', 20,'{"microsoft excel",spreadsheets,"pivot tables",vlookup}','Spreadsheet analysis with formulas, pivot tables and charts.'),
('Pandas','data', 40,'{numpy,dataframes}','Python data analysis with DataFrames: cleaning, joining and reshaping.'),
('Data Cleaning','data', 25,'{"data wrangling","data preprocessing"}','Detecting and fixing missing, duplicate and inconsistent data.'),
('Data Visualization','data', 30,'{matplotlib,seaborn,plotly,charts,dashboards}','Choosing and building charts and dashboards that communicate insight.'),
('Power BI','data', 30,'{powerbi,dax}','Microsoft BI tool for data models, DAX measures and dashboards.'),
('Tableau','data', 30,'{}','Visual analytics platform for interactive dashboards.'),
('A/B Testing','data', 25,'{experimentation,"split testing"}','Designing and analysing controlled experiments.'),
('ETL Pipelines','data', 50,'{etl,elt,"data pipelines"}','Extracting, transforming and loading data reliably between systems.'),
('Apache Spark','data', 60,'{spark,pyspark}','Distributed processing of large datasets.'),
('Airflow','data', 30,'{"apache airflow",orchestration,dags}','Scheduling and orchestrating data workflows as DAGs.'),
-- ml
('Machine Learning','ml',120,'{ml,"supervised learning","unsupervised learning"}','Supervised and unsupervised learning: regression, classification, clustering.'),
('Scikit-learn','ml', 40,'{sklearn,"scikit learn"}','Python library for classical machine learning models and pipelines.'),
('Feature Engineering','ml', 30,'{"feature selection"}','Creating and selecting informative input features for models.'),
('Model Evaluation','ml', 25,'{"cross validation",metrics,"model validation"}','Validation strategies and metrics: precision, recall, ROC, error analysis.'),
('Deep Learning','ml',120,'{"neural networks",cnn,rnn,transformers}','Neural networks: CNNs, RNNs, transformers and training techniques.'),
('PyTorch','ml', 80,'{torch}','Deep-learning framework for building and training neural networks.'),
('NLP','ml', 80,'{"natural language processing","text mining"}','Processing and modelling text: tokenisation, embeddings, classification.'),
('LLM Applications','ml', 50,'{llm,"large language models","prompt engineering",rag,langchain}','Building applications on large language models with retrieval and tools.'),
('MLOps','ml', 60,'{mlflow,"model deployment"}','Deploying, monitoring and versioning ML models in production.'),
-- devops / cloud
('Docker','devops', 25,'{containers,containerization,"docker compose"}','Packaging applications and dependencies into containers.'),
('Kubernetes','devops', 60,'{k8s,helm}','Orchestrating containers at scale.'),
('CI/CD','devops', 25,'{"github actions",jenkins,"continuous integration"}','Automated build, test and deployment pipelines.'),
('AWS','cloud', 80,'{"amazon web services",ec2,s3,lambda}','Core AWS services for compute, storage and networking.'),
('Terraform','cloud', 40,'{"infrastructure as code",iac}','Declaring and provisioning infrastructure as code.'),
('Monitoring & Observability','devops', 30,'{prometheus,grafana,logging,observability}','Metrics, logs, traces and alerting for running systems.'),
-- soft
('Communication','soft', 40,'{presentation,"stakeholder management","technical writing"}','Explaining technical work clearly to technical and non-technical audiences.'),
('Agile/Scrum','soft', 15,'{agile,scrum,jira,kanban}','Working in iterative teams with sprints, stand-ups and retrospectives.');

-- ---------- Prerequisite graph (prereq --> skill) ----------
INSERT INTO skill_prerequisites (skill_id, prereq_skill_id, strength)
SELECT s.skill_id, p.skill_id, v.strength
FROM (VALUES
  ('Python','Programming Fundamentals',1.0), ('JavaScript','Programming Fundamentals',1.0),
  ('Java','Programming Fundamentals',1.0),   ('Go','Programming Fundamentals',1.0),
  ('C++','Programming Fundamentals',1.0),    ('TypeScript','JavaScript',1.0),
  ('Data Structures & Algorithms','Programming Fundamentals',1.0),
  ('Statistics','Probability',0.7),
  ('React','JavaScript',1.0), ('React','HTML & CSS',0.8),
  ('Next.js','React',1.0), ('Next.js','Node.js',0.5),
  ('Accessibility','HTML & CSS',1.0), ('UI/UX Design','HTML & CSS',0.4),
  ('Node.js','JavaScript',1.0),
  ('REST API Design','Programming Fundamentals',0.7), ('REST API Design','Computer Networks',0.6),
  ('GraphQL','REST API Design',0.8),
  ('Spring Boot','Java',1.0), ('Spring Boot','REST API Design',0.7),
  ('Authentication & Security','REST API Design',0.8), ('Authentication & Security','Computer Networks',0.5),
  ('System Design','Data Structures & Algorithms',0.7), ('System Design','Database Design',0.8), ('System Design','Computer Networks',0.7),
  ('Testing','Programming Fundamentals',0.8),
  ('PostgreSQL','SQL',1.0), ('Database Design','SQL',0.8),
  ('MongoDB','Database Design',0.5), ('Graph Databases','Database Design',0.5), ('Redis','Database Design',0.4),
  ('Vector Databases','Linear Algebra',0.5), ('Vector Databases','Database Design',0.5),
  ('Pandas','Python',1.0), ('Data Cleaning','Pandas',0.6),
  ('Data Visualization','Statistics',0.5),
  ('Power BI','Data Visualization',0.8), ('Power BI','Excel',0.5), ('Tableau','Data Visualization',0.8),
  ('A/B Testing','Statistics',1.0), ('A/B Testing','Probability',0.7),
  ('ETL Pipelines','SQL',1.0), ('ETL Pipelines','Python',0.8),
  ('Apache Spark','Python',0.8), ('Apache Spark','SQL',0.7),
  ('Airflow','ETL Pipelines',1.0), ('Airflow','Python',0.7),
  ('Machine Learning','Python',0.9), ('Machine Learning','Statistics',1.0), ('Machine Learning','Linear Algebra',0.7),
  ('Scikit-learn','Machine Learning',1.0), ('Scikit-learn','Pandas',0.6),
  ('Feature Engineering','Pandas',0.8), ('Feature Engineering','Machine Learning',0.8),
  ('Model Evaluation','Machine Learning',1.0), ('Model Evaluation','Statistics',0.7),
  ('Deep Learning','Machine Learning',1.0), ('Deep Learning','Linear Algebra',0.8),
  ('PyTorch','Deep Learning',1.0), ('PyTorch','Python',0.8),
  ('NLP','Machine Learning',0.9), ('NLP','Deep Learning',0.6),
  ('LLM Applications','NLP',0.8), ('LLM Applications','Python',0.7), ('LLM Applications','REST API Design',0.5),
  ('MLOps','Machine Learning',0.9), ('MLOps','Docker',0.8), ('MLOps','CI/CD',0.6),
  ('Linux Command Line','Operating Systems',0.4),
  ('Docker','Linux Command Line',0.8),
  ('Kubernetes','Docker',1.0), ('Kubernetes','Computer Networks',0.6),
  ('CI/CD','Git',1.0), ('CI/CD','Testing',0.6),
  ('AWS','Linux Command Line',0.6), ('AWS','Computer Networks',0.6),
  ('Terraform','AWS',0.8),
  ('Monitoring & Observability','Linux Command Line',0.7), ('Monitoring & Observability','Docker',0.5)
) AS v(skill, prereq, strength)
JOIN skills s ON s.name = v.skill
JOIN skills p ON p.name = v.prereq;

-- ---------- Career roles ----------
INSERT INTO career_roles (title, domain, seniority, description) VALUES
('Data Analyst','Data & Analytics','junior','Turns business questions into SQL queries, dashboards and clear recommendations.'),
('Data Scientist','Data & Analytics','junior','Builds statistical and machine-learning models to explain and predict outcomes.'),
('Machine Learning Engineer','AI & ML','junior','Trains, deploys and operates machine-learning and LLM systems in production.'),
('Data Engineer','Data & Analytics','junior','Designs and runs the pipelines and storage that feed analytics and ML.'),
('Backend Developer','Software Engineering','junior','Builds secure, well-tested APIs and services on top of relational and NoSQL databases.'),
('Frontend Developer','Software Engineering','junior','Builds accessible, responsive web interfaces with modern JavaScript frameworks.'),
('Full-Stack Developer','Software Engineering','junior','Delivers complete web features across the UI, API and database layers.'),
('DevOps Engineer','Infrastructure','junior','Automates build, deployment and operations of cloud infrastructure.');

INSERT INTO role_skills (role_id, skill_id, required_level, importance)
SELECT r.role_id, s.skill_id, v.lvl, v.imp
FROM (VALUES
  ('Data Analyst','SQL',4,1.00), ('Data Analyst','Excel',3,0.70), ('Data Analyst','Statistics',3,0.80),
  ('Data Analyst','Data Visualization',4,0.90), ('Data Analyst','Power BI',3,0.60), ('Data Analyst','Tableau',3,0.50),
  ('Data Analyst','Python',3,0.60), ('Data Analyst','Pandas',3,0.60), ('Data Analyst','Data Cleaning',3,0.80),
  ('Data Analyst','A/B Testing',2,0.40), ('Data Analyst','Communication',3,0.60),

  ('Data Scientist','Python',4,1.00), ('Data Scientist','Statistics',4,0.90), ('Data Scientist','Machine Learning',4,1.00),
  ('Data Scientist','Scikit-learn',4,0.80), ('Data Scientist','Pandas',4,0.80), ('Data Scientist','SQL',3,0.70),
  ('Data Scientist','Feature Engineering',3,0.70), ('Data Scientist','Model Evaluation',3,0.80),
  ('Data Scientist','Data Visualization',3,0.60), ('Data Scientist','Deep Learning',2,0.50),
  ('Data Scientist','A/B Testing',3,0.50), ('Data Scientist','Communication',3,0.50),

  ('Machine Learning Engineer','Python',4,1.00), ('Machine Learning Engineer','Machine Learning',4,0.90),
  ('Machine Learning Engineer','Deep Learning',4,0.80), ('Machine Learning Engineer','PyTorch',3,0.80),
  ('Machine Learning Engineer','MLOps',3,0.90), ('Machine Learning Engineer','Docker',3,0.70),
  ('Machine Learning Engineer','SQL',2,0.40), ('Machine Learning Engineer','Data Structures & Algorithms',3,0.60),
  ('Machine Learning Engineer','Git',3,0.50), ('Machine Learning Engineer','LLM Applications',3,0.70),
  ('Machine Learning Engineer','Vector Databases',2,0.50), ('Machine Learning Engineer','Kubernetes',2,0.40),
  ('Machine Learning Engineer','AWS',2,0.50),

  ('Data Engineer','SQL',5,1.00), ('Data Engineer','Python',4,0.90), ('Data Engineer','ETL Pipelines',4,1.00),
  ('Data Engineer','Apache Spark',3,0.80), ('Data Engineer','Airflow',3,0.70), ('Data Engineer','Database Design',4,0.80),
  ('Data Engineer','PostgreSQL',3,0.60), ('Data Engineer','MongoDB',2,0.40), ('Data Engineer','AWS',2,0.50),
  ('Data Engineer','Docker',2,0.50), ('Data Engineer','Data Cleaning',3,0.60), ('Data Engineer','Git',3,0.50),

  ('Backend Developer','Node.js',4,0.90), ('Backend Developer','REST API Design',4,1.00), ('Backend Developer','SQL',4,0.90),
  ('Backend Developer','PostgreSQL',3,0.70), ('Backend Developer','Database Design',3,0.80),
  ('Backend Developer','Authentication & Security',3,0.80), ('Backend Developer','Testing',3,0.70),
  ('Backend Developer','Git',3,0.60), ('Backend Developer','Data Structures & Algorithms',3,0.60),
  ('Backend Developer','Docker',2,0.50), ('Backend Developer','System Design',2,0.60),
  ('Backend Developer','TypeScript',3,0.60), ('Backend Developer','Redis',2,0.40),

  ('Frontend Developer','HTML & CSS',4,0.90), ('Frontend Developer','JavaScript',4,1.00),
  ('Frontend Developer','TypeScript',3,0.80), ('Frontend Developer','React',4,1.00), ('Frontend Developer','Next.js',3,0.70),
  ('Frontend Developer','Accessibility',3,0.60), ('Frontend Developer','Testing',2,0.50), ('Frontend Developer','Git',3,0.60),
  ('Frontend Developer','REST API Design',2,0.40), ('Frontend Developer','UI/UX Design',2,0.50),

  ('Full-Stack Developer','JavaScript',4,1.00), ('Full-Stack Developer','TypeScript',3,0.80),
  ('Full-Stack Developer','React',3,0.80), ('Full-Stack Developer','Next.js',3,0.80), ('Full-Stack Developer','Node.js',3,0.80),
  ('Full-Stack Developer','REST API Design',3,0.80), ('Full-Stack Developer','SQL',3,0.70),
  ('Full-Stack Developer','PostgreSQL',3,0.60), ('Full-Stack Developer','MongoDB',2,0.50),
  ('Full-Stack Developer','Authentication & Security',3,0.70), ('Full-Stack Developer','Git',3,0.60),
  ('Full-Stack Developer','Docker',2,0.50), ('Full-Stack Developer','Testing',2,0.50),

  ('DevOps Engineer','Linux Command Line',4,1.00), ('DevOps Engineer','Docker',4,0.90), ('DevOps Engineer','Kubernetes',3,0.90),
  ('DevOps Engineer','CI/CD',4,1.00), ('DevOps Engineer','AWS',3,0.80), ('DevOps Engineer','Terraform',3,0.70),
  ('DevOps Engineer','Monitoring & Observability',3,0.70), ('DevOps Engineer','Git',4,0.70),
  ('DevOps Engineer','Computer Networks',3,0.60), ('DevOps Engineer','Python',2,0.50), ('DevOps Engineer','Go',2,0.30)
) AS v(role, skill, lvl, imp)
JOIN career_roles r ON r.title = v.role
JOIN skills s       ON s.name  = v.skill;

INSERT INTO app_meta (key, value) VALUES ('schema_version', '1.0.0');
