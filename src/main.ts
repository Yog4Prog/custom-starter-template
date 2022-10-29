import {approvalContext} from './approvalcontext'
import {approvedWords} from './constants'
import {deniedWords} from './constants'
import axios from 'axios'
import * as core from '@actions/core'
import * as github from '@actions/github'
import {approvalBodyContent} from './issuetemplates'

const actionContext: approvalContext = {
  owner: core.getInput('owner'),
  org: core.getInput('org'),
  repo: core.getInput('repo'),
  assignees: core.getInput('approvers').split(','),
  token: core.getInput('secret'),
  timeout: ~~core.getInput('timeout'),
  title: core.getInput('issue_title'),
  body: core.getInput('body_message'),
  labels: core.getInput('labels').split(',')
}

const repoUrl = `https://api.github.com/repos/${actionContext.org}/${actionContext.repo}`
let timeTrigger: any
let timeDurationCheck: any

async function createApprovalIssue(): Promise<any> {
  let createIssuePayload = JSON.stringify({
    owner: `${actionContext.owner}`,
    repo: `${actionContext.repo}`,
    title: `${actionContext.title}`,
    body: `${approvalBodyContent}`,
    assignees: [`${actionContext.assignees}`],
    labels: [`${actionContext.labels}`]
  })

  let createIssueRequest = {
    method: 'post',
    url: `${repoUrl}/issues`,
    headers: {
      Authorization: `Bearer ${actionContext.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json'
    },
    data: createIssuePayload
  }

  console.log("Request Payload is "+createIssuePayload);

  return await axios(createIssueRequest)
    .then(res => {
      console.log('Github Approval Issue successfully created !!')
      actionContext.issueNumber = res.data.number
      actionContext.status = res.data.state
    })
    .catch(error => {
      console.log('Failed to create an Github Approval Issue.' + error)
      if (error instanceof Error) core.setFailed(error.message)
      throw error
    })
}

async function updateApprovalIssueOnComments(): Promise<any> {
  var commentListRequest = {
    method: 'GET',
    url: `${repoUrl}/issues/${actionContext.issueNumber}/comments`,
    headers: {
      Authorization: `Bearer  ${actionContext.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json'
    }
  }

  return await axios(commentListRequest)
    .then(async res => {
      if (res.data.length > 0) {
        if (
          approvedWords.includes(
            res.data[res.data.length - 1].body.toLowerCase()
          )
        ) {
          console.log(`${actionContext.assignees} Approved to proceed.`)
          await closeIssue()
        } else if (
          deniedWords.includes(res.data[res.data.length - 1].body.toLowerCase())
        ) {
          console.log(`${actionContext.assignees} Denied to proceed.`)
          // Fail the build..
          await closeIssue()
        } else {
          console.log('No matching comments provided.. for Approve or Deny')
        }
      } else {
        console.log('Pending approval, awaiting ..')
      }
    })
    .catch(error => {
      console.log('Error Occured..' + error)
    })
}

async function closeIssue(): Promise<any> {
  var closeIssuePayload = JSON.stringify({
    owner: `${actionContext.owner}`,
    repo: `${actionContext.repo}`,
    state: 'closed'
  })

  var closeIssueRequest = {
    method: 'PATCH',
    url: `${repoUrl}/issues/${actionContext.issueNumber}`,
    headers: {
      Authorization: `Bearer  ${actionContext.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json'
    },
    data: closeIssuePayload
  }

  return await axios(closeIssueRequest)
    .then(cresp => {
      console.log('Approval Request Closed!!')
      clearInterval(timeTrigger)
      clearTimeout(timeDurationCheck)
      timeTrigger = false
    })
    .catch(cerror => {
      console.log('Exception occured ' + cerror)
    })
}

async function run(): Promise<void> {
  console.log("Fetching details of workflow run..");
  console.log(`github.context is ${JSON.stringify(github.context)}`);
  console.log(`github.eventName ${github.context.eventName}` );
  console.log(`github.workflowName ${github.context.workflow}` );
  console.log(`github.repository ${github.context.repo}` );
  //console.log(`github.repositoryUrl ${github.context.repositoryUrl}` );
  console.log(`github.run_id ${github.context.runId}` );
  console.log(`github.run_number ${github.context.runNumber}` );
  
  try {
    await createApprovalIssue()
    timeTrigger = setInterval(updateApprovalIssueOnComments, 5000)
    timeDurationCheck = setTimeout(async function () {
      console.log(
        'Approval waiting period elapsed. Approval request will be automatically closed and workflow status will be marked to Failed.'
      )
      await closeIssue()
    }, actionContext.timeout * 60 * 1000)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
