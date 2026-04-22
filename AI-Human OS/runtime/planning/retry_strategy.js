const PLANNING_RETRY_POLICIES = {
  features_list: {
    max_attempts: 2,
    max_stall_cycles: 1,
  },
  feature_request: {
    max_attempts: 2,
    max_stall_cycles: 1,
  },
  implementation_plan: {
    max_attempts: 4,
    max_stall_cycles: 2,
  },
};

function normalizeFeedbackSignature(feedback = {}) {
  return JSON.stringify({
    failure_code: feedback.failure_code || "unknown",
    errors: (feedback.errors || []).map(error => ({
      type: error.type || "PLAN_DRIFT",
      location: error.location || "global",
      fix_hint: error.fix_hint || "review_and_revise",
      message: error.message || "",
    })),
  });
}

export function getPlanningRetryPolicy(stage) {
  return PLANNING_RETRY_POLICIES[stage] || {
    max_attempts: 3,
    max_stall_cycles: 1,
  };
}

export function assessRetryProgress(previousFeedback, currentFeedback) {
  const previousErrorCount = previousFeedback ? (previousFeedback.errors || []).length : null;
  const currentErrorCount = (currentFeedback?.errors || []).length;
  const sameSignature = previousFeedback
    ? normalizeFeedbackSignature(previousFeedback) === normalizeFeedbackSignature(currentFeedback)
    : false;
  const improved = previousFeedback
    ? currentErrorCount < previousErrorCount
    : true;
  const regressed = previousFeedback
    ? currentErrorCount > previousErrorCount
    : false;
  const stalled = Boolean(previousFeedback) && sameSignature && !improved;

  return {
    previous_error_count: previousErrorCount,
    current_error_count: currentErrorCount,
    improved,
    regressed,
    same_signature: sameSignature,
    stalled,
  };
}

export function shouldContinueRetrying({
  attempt,
  retriable,
  policy,
  stallCount,
}) {
  if (!retriable) {
    return false;
  }

  if (attempt >= policy.max_attempts) {
    return false;
  }

  if (stallCount > policy.max_stall_cycles) {
    return false;
  }

  return true;
}
