import { mongo } from './mongo';

/** MongoDB aggregation pipelines behind the admin analytics page (also in db/mongo/aggregations.js). */
export async function mongoAnalytics() {
  const db = await mongo();
  const since = new Date(Date.now() - 30 * 864e5);

  const [topResumeSkills, unknownTerms, jobSources, activity, resumeCount] = await Promise.all([
    db.collection('resumes_raw').aggregate([
      { $unwind: '$extracted.skills' },
      // a skill appears at most once per resume document, so counting rows counts resumes
      { $group: { _id: '$extracted.skills.name', resumes: { $sum: 1 }, mentions: { $sum: '$extracted.skills.mentions' } } },
      { $project: { _id: 0, skill: '$_id', resumes: 1, mentions: 1 } },
      { $sort: { resumes: -1, mentions: -1, skill: 1 } },
      { $limit: 10 },
    ]).toArray(),
    db.collection('resumes_raw').aggregate([
      { $unwind: '$extracted.unknownTerms' },
      { $group: { _id: '$extracted.unknownTerms', resumes: { $sum: 1 } } },   // terms are lower-cased by the parser
      { $sort: { resumes: -1, _id: 1 } },
      { $limit: 12 },
      { $project: { _id: 0, term: '$_id', resumes: 1 } },
    ]).toArray(),
    db.collection('job_sources').aggregate([
      { $group: { _id: { source: '$source', status: '$status' }, count: { $sum: 1 } } },
      { $project: { _id: 0, source: '$_id.source', status: '$_id.status', count: 1 } },
      { $sort: { source: 1, status: 1 } },
    ]).toArray(),
    db.collection('activity_log').aggregate([
      { $match: { at: { $gte: since } } },
      // two-stage grouping: (day, user) first, then day -> events and distinct users.
      // `day` is a bucket key written with each event (see logActivity)
      { $group: { _id: { day: '$day', user: '$userId' }, events: { $sum: 1 } } },
      { $group: { _id: '$_id.day', events: { $sum: '$events' }, users: { $sum: 1 } } },
      { $project: { _id: 0, day: '$_id', events: 1, users: 1 } },
      { $sort: { day: 1 } },
    ]).toArray(),
    db.collection('resumes_raw').countDocuments(),
  ]);
  return { topResumeSkills, unknownTerms, jobSources, activity, resumeCount };
}
