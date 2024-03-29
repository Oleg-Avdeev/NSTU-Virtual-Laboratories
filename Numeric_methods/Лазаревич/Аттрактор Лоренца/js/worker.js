//importScripts('solvers.js');




var slaveWorker=function()
{
	self.onmessage=function(e)
	{
		//start working
		var options=e.data[1].options;
		options.step=e.data[1].step;
		e.data[0]=JSON.parse(e.data[0]);
		var drawCounter=0;
		var points=0;
		var parameters=e.data[0].parameters;//супер костыль
		options.funcsVector=eval('['+e.data[0].funcs+']');
		if(e.data[0].jacobian!==undefined&&e.data[1].options.jacobianCalc!==undefined)
		{
			options.jacobian=eval('['+e.data[0].jacobian+']');
		}
		//console.log(options.funcsVector);
		importScripts(e.data[2]);
		//console.log(Methods);
		var method=Methods[e.data[1].methodKey];
		method.Init(options);
		var count=e.data[0].values.length;
		var dataArray=new Array(count+1);
		for(var i=0;i<count;i++)
		{
			dataArray[i]=new Array();
			dataArray[i].push(e.data[0].values[i]);
		}
		dataArray[count]=new Array();
		dataArray[count].push(e.data[0].t0);
		var dataTemp={xv:e.data[0].values,t:e.data[0].t0};
		var progress=0;
		var lastprogress=e.data[0].t0;
		var dt=e.data[0].t1-e.data[0].t0;
		var percent10=(dt)*0.1;
		var t0=performance.now();
		while(true)//+
		{
			method.Step(dataTemp);

			if(dataTemp.t>e.data[0].t1)
				{
					for(var i=0;i<count;i++)
					{
						dataArray[i].push(dataTemp.xv[i]);
					}
					dataArray[count].push(dataTemp.t);
					break;
				}
			if(drawCounter==e.data[1].drawStep)
			{
				drawCounter=0;
				for(var i=0;i<count;i++)
				{
					dataArray[i].push(dataTemp.xv[i]);
				}
				dataArray[count].push(dataTemp.t);
				points+=count+1;
			}else
				drawCounter++;
			if(points>=5000)
				break;
			progress=Math.min(dataTemp.t,e.data[0].t1);
			var t1=performance.now();
			//console.log(t1);
			if(t1-t0>20)
			{
				t0=t1;
				if(percent10<progress-lastprogress)
				{
					var dp=(progress-lastprogress)*100/dt;
					postMessage({progress:dp});
					lastprogress=progress;
				}
			}
		}
		var mess={data:dataArray,progress:(e.data[0].t1-lastprogress)*100/dt};
		postMessage(mess);
	}

}







mainWorker=(function()
{

/*	create worker for each task
	send data(xv,step,etc)
	onmessage recieve progress if progress is 100% recieve data Array and draw it
	each 20ms draw progress bar*/
	function init(startButton,progressBarElement)
	{
		progressBar=progressBarElement;
	}
	var progressBar;
	var button;
	var progress=0;
	var workers;
	var workerCount=0;
	var frameID;
	var workerLimit=4;
	var maxNumber=0;
	var numberOfWorkers=0;
	var MethodsUrl;
	var functionUrl;
	function start(data,solvers,Draw,Stop/*(data,j)*/)
	{
		//tasks: step:float[,[minStep:float,maxStep:float,errorTolerance],[jacobianConst:bool],[jacobianAnalythic:bool]]]
		//data: funcs,[jacobian],values,t0

		/**/
		var MethodsBody = '('+InitMethods+')()';
	   	var MethodsBlob = new Blob([MethodsBody]);
	   	MethodsUrl = URL.createObjectURL(MethodsBlob);

		numberOfWorkers=solvers.length;
		workers=new Array(Math.min(workerLimit,numberOfWorkers));
		progressBar.value=0;
		progressBar.max=100;
		progress=0;
		var workerMessage;
		var waitingTasks=solvers.length;
		if(data.jacobian!==undefined)
		{
			workerMessage=JSON.stringify({parameters:data.parameters,funcs:data.functions.toString(),values:data.values,t0:data.argument,t1:data.argument+data.argumentDelta,jacobian:data.jacobian.toString()});
		}else
		{
			workerMessage=JSON.stringify({parameters:data.parameters,funcs:data.functions.toString(),values:data.values,t0:data.argument,t1:data.argument+data.argumentDelta});
		}
		workerCount=solvers.length;
		waitingTasks=Math.max(0,workerCount-workerLimit);
		maxNumber=workerLimit;
		function AddTask(item,j)
		{
			var task={methodKey:item.method.methodKey,step:item.step,options:item.options,drawStep:item.drawStep};
			var arr=[workerMessage,task,MethodsUrl];
			workers[j].postMessage(arr);
			workers[j].onmessage=function(e){
			if(e.data.progress!==undefined)
			{
				progress+=e.data.progress;
			}
			if(e.data.data!==undefined)
			{
				workerCount--;
				Draw(e.data.data,item,j);
				if(workerCount==0)
					{
						progressBar.value=100;
						Stop();
					}
				else if(waitingTasks)
				{
					maxNumber++;
					AddTask(solvers[maxNumber-1],j)
				}
			}
			}
		}
		var functionBody = '('+slaveWorker+')()';
	   	var functionBlob = new Blob([functionBody]);
	   	functionUrl = URL.createObjectURL(functionBlob);
		solvers.forEach(function(item,j)
		{
			if(j<workerLimit)
			{
			workers[j]=new Worker(functionUrl);
	   		AddTask(item,j);
			}
		});
		lastTime=performance.now();
		frameID=window.requestAnimationFrame(loop);
		functionBlob=null;
		MethodsBlob=null;
	}

	function loop(timestamp)
	{
		var dt=timestamp-lastTime;
		if(dt>=20)
		{
		//draw progress
			progressBar.value=progress/numberOfWorkers;
			lastTime=timestamp;
		}
		frameID=window.requestAnimationFrame(loop);
	}
	function stop()
	{
		window.cancelAnimationFrame(frameID);
		//terminate all workers
		for(var i=0;i<workers.length;i++)
			{
				workers[i].terminate();
			}
		URL.revokeObjectURL(MethodsUrl);
		URL.revokeObjectURL(functionUrl);
		MethodsUrl=null;
		functionUrl=null;
	}
	return {init:init,start:start,stop:stop};
})();

