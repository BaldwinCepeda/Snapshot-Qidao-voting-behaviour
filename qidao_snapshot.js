#!/usr/bin/env node
import fetch from 'node-fetch';
import prompt from 'prompt';
import ObjectsToCsv from 'objects-to-csv';
import mariadb from 'mariadb';

const space = 'qidao.eth';
const snapshot_endpoint = "https://hub.snapshot.org/graphql";
const SNAPSHOT_SCORE_API = 'https://score.snapshot.org/api/scores';

async function getProposals(query) {
  try {
   var res = await fetch(snapshot_endpoint+"?", {
     "headers": { "content-type": "application/json" },
     "body": query,
      "method": "POST"
    });
    res = await res.text()
    res = JSON.parse(res);
	//console.log(JSON.stringify(res, null, 4));
    if(res.data.proposals[0] != null) {
      return res.data.proposals;
    } else {
      return null;
    }
  } catch(e){
      console.log(e)
  }
}

async function getVotes(query) {
  try {
   var res = await fetch(snapshot_endpoint+"?", {
     "headers": { "content-type": "application/json" },
     "body": query,
      "method": "POST"
    });
    res = await res.text()
    res = JSON.parse(res);
	//console.log(JSON.stringify(res, null, 4));
    if(res.data.votes[0] != null) {
      return res.data.votes;
    } else {
      return null;
    }
  } catch(e){
      console.log(e)
  }
}

const getVoteScores = async (block, voteAddresses, strategy) => {
  const params = {
    space: "qidao.eth",
    network: "137",
    snapshot: Number(block),
    strategies: strategy,
    addresses: voteAddresses
  };
  var init = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ params })
  };
  var response = await fetch(SNAPSHOT_SCORE_API, init);
  var obj = await response.json();
  
  console.log(obj);
  
  var totalAddresses = {};
  var totalScore = 0;
  for (var i in obj.result.scores) {
    for (var x in voteAddresses) {
      if (obj.result.scores[i][voteAddresses[x]] != undefined) {
        totalScore = totalScore + obj.result.scores[i][voteAddresses[x]];
      }
      if (totalAddresses[voteAddresses[x]] == undefined && obj.result.scores[i][voteAddresses[x]] != undefined) {
        totalAddresses[voteAddresses[x]] = obj.result.scores[i][voteAddresses[x]]
      } else {
        if (obj.result.scores[i][voteAddresses[x]] != undefined) {
          totalAddresses[voteAddresses[x]] = totalAddresses[voteAddresses[x]] + obj.result.scores[i][voteAddresses[x]];
        }
      }
    }
  }
  return totalAddresses;
}

const main = async () => {
    // SELECT PROPOSAL
	var query = JSON.stringify({
		query: "query Proposals { proposals(first: 200, skip: 0, where: {space_in: [\"qidao.eth\"], state: \"closed\"}, orderBy: \"created\", orderDirection: desc) {id, title, body, choices, start, end, snapshot, state, author, network, strategies {name, params}, space {id, name}}}",
			variables: {}
	});
  
	var proposals = await getProposals(query);
	if(proposals == null) { process.exit(); }
	for(var i=0;i<proposals.length;i++) { console.log(i+": "+proposals[i].title); }
	const {selectedProposal} = await prompt.get(['selectedProposal']);
	var selProposalID = proposals[selectedProposal].id;
	var selProposalObj = proposals[selectedProposal];
	
	console.log(selProposalObj);
	
	//GET VOTES FOR SELECTED PROPOSAL
	query = JSON.stringify({
		query: "query {votes(first: 10000, where: {proposal: \"" + selProposalID + "\"}) {id, voter, created, choice, space {id}}}",
		variables: {}
	});
	var votes = await getVotes(query);
	if(votes == null) { process.exit(); }
	
	//console.log(votes);
	
	//GET SCORE FOR ALL VOTERS
	var snapshot_block = selProposalObj.snapshot;
	var votersCheck = [];
	for (var i in votes) {
		votersCheck.push(votes[i].voter);
	}
	var voterScores = await getVoteScores(snapshot_block, votersCheck, selProposalObj.strategies);
	
	//GENERATE FINAL MERGED DATA
	var finalTable = [];
	var thisVoter, thisQiPowah, thisChoice, numChoices, choiceName, networkName;
	var thisRow = {};
	for(var i in votes) {
		thisVoter = votes[i].voter;
		thisQiPowah = voterScores[thisVoter];
		thisChoice = votes[i].choice;
		numChoices = Object.keys(thisChoice).length;
		//calculate total weight across all choices
		var thisTotalWeight = 0;
		for(var key in thisChoice) {
			thisTotalWeight = thisTotalWeight + thisChoice[key];
		}
		//now calculate the ratios
		var thisChoiceRatio = 0;
		var thisChoiceQiPowah = 0;
		for(var key in thisChoice) {
			thisChoiceRatio = thisChoice[key] / thisTotalWeight;
			thisChoiceQiPowah = thisQiPowah * thisChoiceRatio;
		
			//Insert Row
			thisRow = {};
			thisRow.voter = thisVoter;
			thisRow.voterTotalQiPowah = thisQiPowah;
			thisRow.choiceIndex = key;
			thisRow.choiceName = selProposalObj.choices[key-1];
			thisRow.choiceQiPowah = thisChoiceQiPowah;
			thisRow.choiceWeight = thisChoice[key];
			thisRow.choiceRatio = thisChoiceRatio;
			finalTable.push(thisRow);
		}
	}
	//console.log(finalTable);
	
	const csv = new ObjectsToCsv(finalTable)
	var title = selProposalObj.title;
	var filename = title.replace(/[^a-zA-Z0-9]/g, "");
	filename = filename + ".csv";
	csv.toDisk(filename);
}
main();