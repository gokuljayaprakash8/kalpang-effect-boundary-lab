const GITHUB_API = 'https://api.github.com';

function nextPage(linkHeader) {
  const match = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1] || null;
}

function issueArguments(request) {
  return request.params.arguments;
}

function commentsUrl(request) {
  const { owner, repo, issue_number: issueNumber } = issueArguments(request);
  return `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?sort=created&direction=desc&per_page=100`;
}

export function createGitHubRestObserver({ token, fetchImpl = fetch }) {
  async function getJson(url) {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub REST observation unavailable (HTTP ${response.status})`);
    }
    return response;
  }

  return {
    async listIssueComments(request) {
      let url = commentsUrl(request);
      const comments = [];
      while (url) {
        const response = await getJson(url);
        const page = await response.json();
        if (!Array.isArray(page)) {
          throw new Error('GitHub REST observation returned an invalid comment list');
        }
        comments.push(...page);
        url = nextPage(response.headers?.get('link'));
      }
      return comments;
    },

    async getComment(request, commentId) {
      const { owner, repo } = issueArguments(request);
      const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${commentId}`;
      const response = await getJson(url);
      return response.json();
    },
  };
}