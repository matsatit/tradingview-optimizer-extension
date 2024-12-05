// Select all input values
var tvInputs = document.querySelectorAll("div[data-name='indicator-properties-dialog'] input[inputmode='numeric']")
var tvInputControls = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*=controlWrapper]")
var maxProfit = -99999
// user parameters and time frames
var userInputs = []
var userTimeFrames = []
var optimizationResults = new Map();
var shouldStop = false;

// Run Optimization Process 
Process()

async function Process() {    
    var shouldStop = false;
    //Construct UserInputs with callback
    var userInputsEventCallback = function (evt) {
        window.removeEventListener("UserInputsEvent", userInputsEventCallback, false)
        userInputs = evt.detail.parameters
        userTimeFrames = evt.detail.timeFrames
    }

    window.addEventListener("UserInputsEvent", userInputsEventCallback, false);

    var stopOptimizationEventCallback = function (evt) {
        window.removeEventListener("StopOptimizationEvent", stopOptimizationEventCallback, false)
        shouldStop = evt.detail.event.isTrusted
    }

    window.addEventListener("StopOptimizationEvent", stopOptimizationEventCallback, false);

    //Wait for UserInputsEvent Callback
    await sleep(750)
    // sort userInputs before starting optimization 
    userInputs.sort(function (a, b) {
        return a.parameterIndex - b.parameterIndex;
    });
    // Total Loop Size: Step(N) * Step(N+1) * ...Step(Nth) Up to 4 Parameters max, will be up to 8 for plus users.
    var ranges = [];

    // Create user input ranges with given step size for each parameter
    userInputs.forEach((element, index) => {
        var range = 0
        // fix index for free users
        if (element.parameterIndex == -1) {
            element.parameterIndex = index
        }
        if (index == 0) {
            range = (element.end - element.start) / element.stepSize
            var roundedRange = Math.round(range * 100) / 100
            ranges.push(roundedRange)
        } else {
            range = ((element.end - element.start) / element.stepSize)
            var roundedRange = (Math.round(range * 100) / 100) + 1
            ranges.push(roundedRange)
        }
    });

    if (userTimeFrames == null || userTimeFrames.length <= 0) {
        // no time frame selection or free user flow
        await OptimizeStrategy()
    } else {
        for (let i = 0; i < userTimeFrames.length; i++) {
            // open time intervals dropdown and change it
            await sleep(500)

            var timeIntervalDropdown = document.querySelector("#header-toolbar-intervals div[class*='menuContent']")
            // check if user has favorite time frames selected
            if (timeIntervalDropdown == null) {
                timeIntervalDropdown = document.querySelector("#header-toolbar-intervals button[data-tooltip*='Time']")
            }
            timeIntervalDropdown.click()

            var timeIntervalQuery = `div[data-value='${userTimeFrames[i][0]}']`
            await sleep(2000)
            document.querySelector(timeIntervalQuery).click()
            await sleep(2000)

            await OptimizeStrategy()
            // reset global variables for new strategy optimization and for new timeframe
            optimizationResults = new Map();
            maxProfit = -99999
        }
    }

    // Optimize strategey for the currently chosen timeframe
    async function OptimizeStrategy() {
        shouldStop = false;
        await SetUserIntervals()

        // Base call function
        const baseCall = async () => {
            for (let j = 0; j < ranges[0]; j++) {
                if (shouldStop) {
                    break;
                }
                await OptimizeParams(userInputs[0].parameterIndex, userInputs[0].stepSize);
            }
        };

        // Wrapper function for subsequent calls to build nested for loops
        const wrapSubsequentCalls = async (baseCall, index) => {
            if (index >= ranges.length) {
                // start executing after wrapping everything in place
                await baseCall()
                return;
            }

            const currentCall = async () => {
                for (let j = 0; j < ranges[index]; j++) {
                    if (shouldStop) {
                        break;
                    }
                    await baseCall();
                    await ResetInnerOptimizeOuterParameter(ranges, j, index);
                }
            };

            await wrapSubsequentCalls(currentCall, index + 1); // recursive call for the next level
        };

        // Function to execute nested loops
        const executeNestedLoops = async () => {
            await wrapSubsequentCalls(baseCall, 1); // Wrap and execute subsequent calls recursively starting from index 1
        };

        // Call the function to execute the nested loops
        await executeNestedLoops()

        //Add ID, StrategyName, Parameters and MaxProfit to Report Message
        var strategyName = document.querySelector("div[class*=strategyGroup]")?.innerText
        var strategyTimePeriod = ""

        var timePeriodGroup = document.querySelectorAll("div[class*=innerWrap] div[class*=group]")
        if (timePeriodGroup.length > 1) {
            selectedPeriod = timePeriodGroup[1].querySelector("button[aria-checked*=true]")

            // Check if favorite time periods exist  
            if (selectedPeriod != null) {
                strategyTimePeriod = selectedPeriod.querySelector("div[class*=value]")?.innerHTML
            } else {
                strategyTimePeriod = timePeriodGroup[1].querySelector("div[class*=value]")?.innerHTML
            }
        }

        var title = document.querySelector("title")?.innerText
        var strategySymbol = title.split(' ')[0]
        var optimizationResultsObject = Object.fromEntries(optimizationResults);
        var userInputsToString = ""

        userInputs.forEach((element, index) => {
            if (element.parameterName != null) {
                userInputsToString += element.parameterName + ": "
            }
            if (index == userInputs.length - 1) {
                userInputsToString += element.start + "→" + element.end
            } else {
                userInputsToString += element.start + "→" + element.end + "<br>"
            }
        })

        var reportDataMessage = {
            "strategyID": Date.now(),
            "created": Date.now(),
            "strategyName": strategyName,
            "symbol": strategySymbol,
            "timePeriod": strategyTimePeriod,
            "parameters": userInputsToString,
            "maxProfit": maxProfit,
            "reportData": optimizationResultsObject
        }
        // Send Optimization Report to injector
        var evt = new CustomEvent("ReportDataEvent", { detail: reportDataMessage });
        window.dispatchEvent(evt);
    }

}

// Set User Given Intervals Before Optimization Starts
async function SetUserIntervals() {
    for (let i = 0; i < userInputs.length; i++) {
        var userInput = userInputs[i]
        var startValue = userInput.start - userInput.stepSize
        
        if (isFloat(startValue)) {
            var precision = getFloatPrecision(userInput.stepSize)
            startValue = fixPrecision(startValue, precision)
        }
        
        // reset by step size in case of a user input is as same as current tv input value 
        if(userInput.start == tvInputs[userInput.parameterIndex].value){
            await OptimizeParams(userInput.parameterIndex, "-" + userInput.stepSize)
        }else{
            ChangeTvInput(tvInputs[userInput.parameterIndex], startValue)    
        }
        
        await OptimizeParams(userInput.parameterIndex, userInput.stepSize)
    
        await sleep(250);
    }
    //TO-DO: Inform user about Parameter Intervals are set and optimization starting now.
}

// Optimize strategy for given tvParameterIndex, increment parameter and observe mutation 
async function OptimizeParams(tvParameterIndex, stepSize) {
    function newReportData() {
        return new Object({
            netProfit: {
                amount: 0,
                percent: ""
            },
            closedTrades: 0,
            percentProfitable: "",
            profitFactor: 0.0,
            maxDrawdown: {
                amount: 0,
                percent: ""
            },
            averageTrade: {
                amount: 0,
                percent: ""
            },
            avgerageBarsInTrades: 0,
            detailedParameters: []
        });
    }

    var reportData = newReportData()
    var isReportChartUpdated = false;

    tvInputs[tvParameterIndex].dispatchEvent(new MouseEvent('mouseover', { 'bubbles': true }));
    setTimeout(() => {
        // Calculate new step value
        var newStepValue = parseFloat(tvInputs[tvParameterIndex].value) + parseFloat(stepSize)
        if (isFloat(newStepValue)) {
            var precision = getFloatPrecision(stepSize)
            newStepValue = fixPrecision(newStepValue, precision)
        }

        ChangeTvInput(tvInputs[tvParameterIndex], newStepValue)
    }, 100);
    setTimeout(() => {
       // Click on "Ok" button
       document.querySelector("button[data-name='submit-button']").click() 
    }, 300);
    // Observe mutation for new Test results, validate it and save it to optimizationResults Map
    const p1 = new Promise((resolve, reject) => {
        var observer = new MutationObserver(function (mutations) {
            mutations.every(function (mutation) {
                if (mutation.type === 'characterData') {
                    if (mutation.oldValue != mutation.target.data) {
                        var result = saveOptimizationReport(userInputs, reportData, mutation)
                        resolve(result)
                        observer.disconnect()
                        return false
                    }
                }

                if (mutation.type === 'childList' && mutation.target?.className.includes("chartContainer")) {
                    if (mutation.addedNodes.length > 0 && mutation.addedNodes[0].className.includes("lightweight")) {
                        isReportChartUpdated = true;
                    }
                }
                
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0){
                    if (mutation.addedNodes[0].querySelector("div[class*=emptyStateIcon]") != null){
                        reject(new Error("No report data, check your parameters carefully"))    
                    }
                }
                return true
            });
        });

        var element = document.querySelector("div[class*=backtesting][class*=deep-history]")
        let options = {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,
            attributes: true,
            attributeOldValue: true
        }
        observer.observe(element, options);
    });

    const p2 = new Promise((resolve, reject) => {
        setTimeout(() => {
            // expected error type, kind of warning
            reject("Timeout exceeded")
        }, 10 * 1000);
    });

    // Promise race the obvervation with 10 sec timeout in case of Startegy Test Overview window fails to load
    await Promise.race([p1, p2])
        .then()
        .catch((error) => {
            console.log(`Rejected: ${error}`)
            if (isReportChartUpdated) {
                // try to save previous report if next iteration has same data
                saveOptimizationReport(userInputs, newReportData(), null)
            }
        });
    // Re-open strategy settings window
    document.querySelector(".fixedContent-zf0MHBzY").querySelector("button").click()    

    await sleep(250)
    tvInputs = document.querySelectorAll("div[data-name='indicator-properties-dialog'] input[inputmode='numeric']")
    tvInputControls = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*=controlWrapper]")
}


function saveOptimizationReport(userInputs, reportData, mutation) {
    var result = GetParametersFromWindow(userInputs)
    var parameters = result.parameters
    if (!optimizationResults.has(parameters) && parameters != "ParameterOutOfRange") {
        var error = ReportBuilder(reportData, mutation)
        if (error != null) {
            return error.message
        }
        reportData.detailedParameters = result.detailedParameters
        optimizationResults.set(parameters, reportData)
        //Update Max Profit
        replacedNDashProfit = reportData.netProfit.amount.replace("−", "-")
        profit = Number(replacedNDashProfit.replace(/[^0-9-\.]+/g, ""))
        if (profit > maxProfit) {
            maxProfit = profit
        }
        return ("Optimization param added to map: " + parameters + " Profit: " + optimizationResults.get(parameters).netProfit.amount)
    } else if (optimizationResults.has(parameters)) {
        return ("Optimization param already exist " + parameters)
    } else {
        return ("Parameter is out of range, omitted")
    }
}

// Reset & Optimize (tvParameterIndex)th parameter to starting value  
async function ResetAndOptimizeParameter(tvParameterIndex, resetValue, stepSize) {
    ChangeTvInput(tvInputs[tvParameterIndex], resetValue)
    await sleep(500)
    await OptimizeParams(tvParameterIndex, stepSize)
}

// Reset & Optimize Inner Loop parameter, Optimize Outer Loop parameter
async function ResetInnerOptimizeOuterParameter(ranges, rangeIteration, index) {
    var previousTvParameterIndex = userInputs[index - 1].parameterIndex
    var currentTvParameterIndex = userInputs[index].parameterIndex
    
    var resetValue = userInputs[index - 1].start - userInputs[index - 1].stepSize
    
    var previousStepSize = userInputs[index - 1].stepSize
    var currentStepSize = userInputs[index].stepSize
    //Reset and optimze inner
    await ResetAndOptimizeParameter(previousTvParameterIndex, resetValue, previousStepSize)
    // Optimize outer unless it's last iteration
    if (rangeIteration != ranges[index] - 1) {
        await OptimizeParams(currentTvParameterIndex, currentStepSize)
    }
}

// Change TvInput value in Tv Strategy Options Window
function ChangeTvInput(input, value) {
    const event = new Event('input', { bubbles: true })
    const previousValue = input.value

    input.value = value
    input._valueTracker.setValue(previousValue)
    input.dispatchEvent(event)
}

// Increment Parameter without observing the mutation
function IncrementParameter(tvParameterIndex) {
    //Hover on Input Arrows  
    tvInputs[tvParameterIndex].dispatchEvent(new MouseEvent('mouseover', { 'bubbles': true }));

    //Click on Upper Input Arrow
    var promise = new Promise((resolve, reject) => {
        setTimeout(() => {
            tvInputControls[tvParameterIndex].querySelector("button[class*=controlIncrease]").click()
            resolve("");
        }, 500);
    });
    return promise;
}

// Get Currently active parameters from Tv Strategy Options Window and format them
function GetParametersFromWindow() {
    var parameters = "";
    var result = new Object({
        parameters: "",
        detailedParameters: []
    });

    for (let i = 0; i < userInputs.length; i++) {
        var userInput = userInputs[i]
        if (userInput.start > parseFloat(tvInputs[userInput.parameterIndex].value) || parseFloat(tvInputs[userInput.parameterIndex].value) > userInput.end) {
            parameters = "ParameterOutOfRange"
            break
        }
        if (i == userInputs.length - 1) {
            parameters += tvInputs[userInput.parameterIndex].value
        } else {
            parameters += tvInputs[userInput.parameterIndex].value + ", "
        }
        if (userInput.parameterName != null) {
            result.detailedParameters.push({
                name: userInput.parameterName,
                value: tvInputs[userInput.parameterIndex].value,
            })
        }
    }
    result.parameters = parameters
    return result
}

// Build Report data from performance overview
function ReportBuilder(reportData, mutation) {
    var reportDataSelector;
    // if mutation is nil, save the same report as there is no report data update
    if (mutation != null) {
        reportDataSelector = mutation.target.ownerDocument.querySelectorAll("[class^='secondRow']")
    } else {
        reportDataSelector = document.querySelector("div[class*=backtesting][class*=deep-history]").
            ownerDocument.querySelectorAll("[class^='secondRow']")
    }

    if (reportDataSelector == null || reportDataSelector.length <= 0) {
        return new Error("report data is not available")
    }

    //1. Column
    reportData.netProfit.amount = reportDataSelector[0].querySelectorAll("div")[0].innerText
    reportData.netProfit.percent = reportDataSelector[0].querySelectorAll("div")[1].innerText
    //2. 
    reportData.closedTrades = reportDataSelector[1].querySelector("div").innerText
    //3.
    reportData.percentProfitable = reportDataSelector[2].querySelector("div").innerText
    //4.
    reportData.profitFactor = reportDataSelector[3].querySelector("div").innerText
    //5.
    reportData.maxDrawdown.amount = reportDataSelector[4].querySelectorAll("div")[0].innerText
    reportData.maxDrawdown.percent = reportDataSelector[4].querySelectorAll("div")[1].innerText
    //6.
    reportData.averageTrade.amount = reportDataSelector[5].querySelectorAll("div")[0].innerText
    reportData.averageTrade.percent = reportDataSelector[5].querySelectorAll("div")[1].innerText

    reportData.avgerageBarsInTrades = reportDataSelector[6].querySelector("div").innerText
}


// isFloat to check whether given number is float or not
function isFloat(number){
    if (String(number).includes(".")) {
        return true
    }
    return false
}

// getFloatPrecision to get precision of given float number
function getFloatPrecision(number){
    if (isFloat(number)) {
        return String(number).split(".")[1].length    
    }else {
        // default precision value
        return 2
    }
    
}

// fixPrecision handles js floating arithmetic precision problem
function fixPrecision(value, precision){
    var multiplier = Math.pow(10, precision)
    return Math.round(value * multiplier) / multiplier    
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//Mutation Observer Code for console debugging purposes
/*
        var observer = new MutationObserver(function (mutations) {
            mutations.every(function (mutation) {
                if (mutation.type === 'characterData') {
                    if(mutation.oldValue != mutation.target.data){
                        console.log(mutation)
                        observer.disconnect()
                        return false
                    }
                }
                return true
            });
        });

        var element = document.querySelector("div[class*=backtesting][class*=deep-history]")
        let options = {
            attributes: false,
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,
            attributes: true,
            attributeOldValue: true
        }
        observer.observe(element, options);
*/