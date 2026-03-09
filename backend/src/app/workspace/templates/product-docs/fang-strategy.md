## Background on FANG

Just for FYI and not to be used in the actual document. Full template below under FANG header.

#### **What is FANG?**

Perhaps you have heard "the FANG" or "FANG doc" floating around in reference to design docs or written proposals. Here's a guide to what it means and what it's for. (No, it's not that *FANG*.)

##### **The inputs to your decision**

FANG is simply the *inputs to your decision*. It's not the solution, it's the criteria by which you will evaluate possible solutions or consider revisiting previous solutions. Think of it as the intro section to any design or proposal. Point by point:  
**Framing**: The context for understanding why this is even a decision in the first place. This most often takes the form of a problem statement. Also a good place to put supporting facts or other information that is important to understand for evaluating solutions.  
**Assumptions**: The best information you have that would have material influence on potential solutions. These should be things that can change. If they can't, they are framing. If an assumption changing doesn’t affect the solution space, you can safely cut it for clarity.  
**Non-goals**: What potential solutions don't need to solve for. This is very often things you are willing to trade off against in order to accomplish your goals.  
**Goals**: What potential solutions *do* need to solve for.  
These are all just tools for having a robust discussion, letting people who weren't there understand how the decision was made, and making it clear when you'd revisit. Assumptions could be invalidated; different goals might make sense.

##### **Common mistakes**

Including too much information in your framing. If it's not important for understanding what to do about the problem, you don't need it. It's tempting to include a history lesson here, but almost never necessary. For instance, if you have a legacy commitment you have to abide by, you can assume that you have to maintain the commitment and make it a goal not to break it. If that assumption changes, the solution changes.  
Stating hard facts as assumptions. Think of framing as backward-looking and assumptions as forward-looking. You really want assumptions to be things that can change. We can't change the past with current technology. At least that's what I'm assuming.  
Setting goals (and non-goals) for the meeting instead of the solution. I often see goals like "reach alignment on the design" and non-goals like "discuss feature X". Design goals are things like "product can be used one-handed" and "costs less than $110 to build". Non-goals are "make it as small and light as possible". If you don't include the *design* goals, it's impossible to know whether your proposal satisfies them.

##### **FANG docs**

A practice that I like to use sometimes is creating a "FANG doc", which would more precisely be called a "FANG-only doc". This is where you state *only* the FANG and then stop short of proposing any potential solutions. This is useful in a couple of cases.  
1) As a quick check-in to make sure everyone is aligned on the problem before investing a lot of time in developing a solution.  
2) As an aid to resolving a debate that isn't progressing. In my experience, this is almost always a proxy debate about goals or assumptions. The two camps eventually discover they are trying to do different things. If you take away everyone's ability to set up shop on their preferred solution, you have no choice but to debug this. Maybe at the end you do disagree only on the solution and need to escalate in order to get unstuck. The escalation will go a lot better if you've first done this work.  
Once you have alignment on the inputs, you can proceed to build the rest of the document.

# ---

# \<Project name here\>

Status:  { Draft \| RFC \[Request for Comments\] \| Final \| Inactive }  
Author(s): \<Name\>  
Last Update: \<Date\>

## Document Sign Off

This section is only used as needed and can be adapted to the needs of the particular team / problem. It can provide the following:

* Clarify Buy-in or comments / perspective from key stakeholders - it’s best for the document author to identify these stakeholders prior to the RFC phase of the doc and even engage them during the Draft phase.  
* Document sign off may not be limited to the above key stakeholders. If you take the time to read a doc then please engage with comments and changes if you have something to say. Use the sign-off section to signal to the author that you appreciate the work they put into the doc, that you have read it, and that your comments and changes (if any) are in the doc.

Please add your name here once you've reviewed the document and list how much of it you've reviewed. 

| *Who* | *Date* | *Notes* | *Final Sign-off* |
| :---- | :---- | :---- | :---- |
| Working Team (Draft Phase+) |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
| Additional Reviewers (RFC Phase+) |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

\[high level summary of doc can be included after the FANG approach has been applied and doc moves to Request For Comments, RFC\]  
Example: The document proposes an xyz team goal to develop A to enable B. We will motivate the context and goals using FANG, and introduce our proposed solution. The expected outcome is to move forward with integrating this solution to ship in our next release of ABC. 

# FANG

## Framing the Problem

\[The context for understanding why this is even a decision in the first place. This most often takes the form of a problem statement. Also a good place to put supporting facts or other information that is important to understand for evaluating solutions.\]

## Assumptions

\[Assumptions are the highly relevant and indisputable facts that guide our thinking. The best information you have that would have material influence on potential solutions. These should be things that can change. If they can't, they are framing. If an assumption changing doesn’t affect the solution space, you can safely cut it for clarity.\]

For this project we have the following assumptions:

* 

## Non-Goals

\[What potential solutions don't need to solve for. This is very often things you are willing to trade off against in order to accomplish your goals.\]

* 

## Goals (priority ordered)

\[What potential solutions *do* need to solve for.\]

1. 

# 

# Discussion

\[Area for known questions, open items as the team is working through drafting the doc\]

# Proposed Solutions

\[Solution summary if / when available\]

## Solution Elements

High level element

* Details

## Further Reading

If relevant, link to other documents such as detailed background information, plan proposals, etc.

## Document History

| \<Name\> | \<Date\> | \<Description - e.g. Initial draft? |
| :---- | :---- | :---- |
|  |  |  |
|  |  |  |
|  |  |  |