// =====================================================================
// SkillGraph · MongoDB aggregation pipelines (demo)
// Run:  mongosh "$MONGODB_URI" db/mongo/aggregations.js
// The same pipelines are used by GET /api/admin/analytics (lib/mongo-analytics.ts).
// =====================================================================

print('\n=== A1  Most frequently detected skills across all resumes ===');
printjson(db.resumes_raw.aggregate([
  { $unwind: '$extracted.skills' },
  { $group: {
      _id: '$extracted.skills.name',
      resumes: { $sum: 1 },                       // one entry per skill per resume
      totalMentions: { $sum: '$extracted.skills.mentions' } } },
  { $project: { _id: 0, skill: '$_id', resumes: 1, totalMentions: 1 } },
  { $sort: { resumes: -1, totalMentions: -1 } },
  { $limit: 10 }
]).toArray());

print('\n=== A2  Terms in resumes that are NOT in the skill catalogue (catalogue gaps) ===');
printjson(db.resumes_raw.aggregate([
  { $unwind: '$extracted.unknownTerms' },
  { $group: { _id: '$extracted.unknownTerms', resumes: { $sum: 1 } } },   // terms are lower-cased by the parser
  { $match: { resumes: { $gte: 1 } } },
  { $sort: { resumes: -1, _id: 1 } },
  { $limit: 15 }
]).toArray());

print('\n=== A3  Job ingestion by source and status ===');
printjson(db.job_sources.aggregate([
  { $group: { _id: { source: '$source', status: '$status' }, count: { $sum: 1 },
              lastIngested: { $max: '$ingestedAt' } } },
  { $sort: { '_id.source': 1, '_id.status': 1 } }
]).toArray());

print('\n=== A4  Skills requested per source (raw payloads have different shapes) ===');
printjson(db.job_sources.aggregate([
  { $match: { status: 'normalized' } },
  { $unwind: '$normalized.skills' },
  { $group: { _id: { skill: '$normalized.skills', source: '$source' }, postings: { $sum: 1 } } },
  { $group: { _id: '$_id.skill', postings: { $sum: '$postings' }, sources: { $push: '$_id.source' } } },
  { $sort: { postings: -1 } },
  { $limit: 10 }
]).toArray());

print('\n=== A5  Activity per day and event type (last 30 days) ===');
printjson(db.activity_log.aggregate([
  { $match: { at: { $gte: new Date(Date.now() - 30 * 864e5) } } },
  { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$at' } }, type: '$type' }, n: { $sum: 1 } } },
  { $sort: { '_id.day': 1, '_id.type': 1 } }
]).toArray());

print('\n=== A6  Text search inside resumes ===');
printjson(db.resumes_raw.find(
  { $text: { $search: 'dashboard power bi' } },
  { score: { $meta: 'textScore' }, fileName: 1, userId: 1 }
).sort({ score: { $meta: 'textScore' } }).limit(5).toArray());
